import { enviarEmailDireto } from "@/lib/email";
import { emailAcessoLiberado } from "@/lib/email-core";
import { depoisDaResposta } from "@/lib/segundo-plano";
import { and, eq, ne, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { usuarios } from "@/db/schema";
import { adminUsuarioSchema } from "@/lib/auth-validation";
import { exigirAdmin, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { diffCampos } from "@/lib/auditoria-core";
import { erro, ok, parseCorpo } from "@/lib/http";
import { comandoEncerrarSessoesSeInativo, comandoExcluirUsuario, comandoTrocarPapel, comandoTrocarStatus, consultaPapelDaChave } from "@/lib/papeis-sql";
import { unidadeDeTrabalhoValida } from "@/lib/reparticoes";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");

  const corpo = await parseCorpo(adminUsuarioSchema, req);
  if ("resp" in corpo) return corpo.resp;
  const { nome, email, matricula, cargo, reparticaoId, role, status } = corpo.data;

  // Impede o admin de remover o próprio acesso (evita lockout).
  if (
    id === guard.u.id &&
    ((role && role !== "admin") || (status && status !== "ativo"))
  ) {
    return erro("Você não pode remover o próprio acesso de administrador.");
  }

  const db = getDb();

  // E-mail é único: rejeita se já pertence a outro usuário.
  if (email !== undefined) {
    const [dono] = await db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(and(eq(usuarios.email, email), ne(usuarios.id, id)))
      .limit(1);
    if (dono) return erro("Este e-mail já está em uso.", 409);
  }

  const [antes] = await db
    .select({ nome: usuarios.nome, email: usuarios.email, matricula: usuarios.matricula, cargo: usuarios.cargo, reparticaoId: usuarios.reparticaoId, role: usuarios.role, status: usuarios.status })
    .from(usuarios)
    .where(eq(usuarios.id, id))
    .limit(1);
  if (!antes) return erro("Usuário não encontrado.", 404);
  // A unidade de trabalho nova tem de ser escolhível (nem oculta nem a "Geral"); manter a atual sempre vale.
  if (reparticaoId != null && reparticaoId !== antes.reparticaoId && !(await unidadeDeTrabalhoValida(reparticaoId)))
    return erro("Selecione uma unidade válida.", 422);

  // PAPEL e STATUS primeiro, pelos comandos com a TRAVA do último Administrador ativo (no próprio UPDATE — duas telas de
  // ADM ao mesmo tempo nunca deixam o sistema sem ADM); recusado ⇒ 409 e nada mais é gravado.
  if (role !== undefined) {
    const [papel] = await consultaPapelDaChave(db, role);
    if (!papel) return erro("Papel não encontrado — recarregue a tela.", 409);
    if ((await comandoTrocarPapel(db, id, papel.id)).length === 0)
      return erro("Não é possível tirar o último Administrador ativo — torne outra pessoa Administrador antes.", 409);
  }
  if (status !== undefined) {
    // Sem estar ativa, a pessoa perde as sessões no mesmo lote (reativar nunca ressuscita uma sessão antiga).
    const [trocou] = await db.batch([comandoTrocarStatus(db, id, status), comandoEncerrarSessoesSeInativo(db, id)]);
    if (trocou.length === 0) return erro("Não é possível desativar o último Administrador ativo.", 409);
  }
  const set = {
    ...(nome !== undefined ? { nome } : {}),
    ...(email !== undefined ? { email } : {}),
    ...(matricula !== undefined ? { matricula: matricula ? matricula : null } : {}),
    ...(cargo !== undefined ? { cargo: cargo ? cargo : null } : {}),
    ...(reparticaoId !== undefined ? { reparticaoId } : {}),
  };
  if (Object.keys(set).length > 0) await db.update(usuarios).set({ ...set, atualizadoEm: sql`(CURRENT_TIMESTAMP)` }).where(eq(usuarios.id, id));
  // Acesso LIBERADO (pendente → ativo): a pessoa recebe o aviso por e-mail (com o Resend ativo; depois da resposta).
  if (antes.status === "pendente" && status === "ativo") {
    const destino = email ?? antes.email;
    const quem = nome ?? antes.nome;
    depoisDaResposta(enviarEmailDireto([destino], (ctx) => emailAcessoLiberado({ nome: quem }, ctx)), "email");
  }
  // Log com destaque para PAPEL/STATUS (mudança de privilégio = alto valor).
  const cs = (["nome", "email", "matricula", "cargo", "reparticaoId", "role", "status"] as const).filter((c) => corpo.data[c] !== undefined);
  const dd = diffCampos(antes as Record<string, unknown>, corpo.data as Record<string, unknown>, cs, {
    nome: "nome",
    email: "e-mail",
    matricula: "matrícula",
    cargo: "cargo/função",
    reparticaoId: "unidade",
    role: "papel",
    status: "status",
  });
  await registrarAuditoria({
    usuario: guard.u,
    acao: "editar",
    entidade: "usuario",
    entidadeId: id,
    resumo: `Usuário ${antes.nome}: ${dd.resumo || "editado"}`,
    antes: dd.antes,
    depois: dd.depois,
  });
  return ok();
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  if (id === guard.u.id) return erro("Você não pode excluir a si mesmo.");
  const db = getDb();
  const [alvo] = await db.select({ nome: usuarios.nome, email: usuarios.email }).from(usuarios).where(eq(usuarios.id, id)).limit(1);
  if (!alvo) return erro("Usuário não encontrado.", 404);
  if ((await comandoExcluirUsuario(db, id)).length === 0) return erro("Não é possível excluir o último Administrador ativo.", 409);
  await registrarAuditoria({ usuario: guard.u, acao: "excluir", entidade: "usuario", entidadeId: id, resumo: `Usuário ${alvo.nome} excluído`, antes: alvo });
  return ok();
}
