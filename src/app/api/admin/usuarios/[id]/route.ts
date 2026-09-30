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
import { getIntegracoes } from "@/lib/integracoes";
import { resendConfigurado } from "@/lib/integracoes-core";
import { cargoCadastrado } from "@/lib/cargos";
import { matriculaEmUso, MSG_MATRICULA_EM_USO, violouMatriculaUnica } from "@/lib/usuarios-unicos";

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
  const { nome, email, matricula, cargo, reparticaoId, role, status, telefone, telefoneWhatsapp, validar, trocarSenha } = corpo.data;

  // Impede o admin de remover o próprio acesso (evita lockout).
  if (
    id === guard.u.id &&
    ((role && role !== "admin") || (status && status !== "ativo"))
  ) {
    return erro("Você não pode remover o próprio acesso de administrador.");
  }
  if (id === guard.u.id && trocarSenha) return erro("Para trocar a sua própria senha, use o Perfil.", 422);

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

  // Matrícula é única (sem os zeros à esquerda) — a MESMA régua do gatilho do banco.
  if (matricula && (await matriculaEmUso(matricula, id))) return erro(MSG_MATRICULA_EM_USO, 409);

  const [antes] = await db
    .select({
      nome: usuarios.nome,
      email: usuarios.email,
      matricula: usuarios.matricula,
      cargo: usuarios.cargo,
      reparticaoId: usuarios.reparticaoId,
      telefone: usuarios.telefone,
      telefoneWhatsapp: usuarios.telefoneWhatsapp,
      role: usuarios.role,
      status: usuarios.status,
      dadosValidadosEm: usuarios.dadosValidadosEm,
      trocarSenha: usuarios.trocarSenha,
    })
    .from(usuarios)
    .where(eq(usuarios.id, id))
    .limit(1);
  if (!antes) return erro("Usuário não encontrado.", 404);
  // O cargo/função: um da lista do ADM (o nome como está no cadastro), manter o atual ou "" (nenhum).
  let cargoNovo = cargo;
  if (cargo && cargo !== antes.cargo) {
    const c = await cargoCadastrado(cargo);
    if (!c) return erro("Escolha um cargo ou função cadastrado.", 422);
    cargoNovo = c;
  }
  // A unidade de trabalho nova tem de ser escolhível (nem oculta nem a "Geral"); manter a atual sempre vale.
  if (reparticaoId != null && reparticaoId !== antes.reparticaoId && !(await unidadeDeTrabalhoValida(reparticaoId)))
    return erro("Selecione uma unidade válida.", 422);

  // A SENHA NOVA obrigatória vale pelo código enviado ao e-mail: sem o envio (Resend), a pessoa ficaria presa.
  if (trocarSenha && !antes.trocarSenha && !resendConfigurado(await getIntegracoes()))
    return erro("Configure o envio de e-mails (Integrações → Resend) antes de exigir uma senha nova: a troca é confirmada por código.", 409);

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
  const dados = {
    ...(nome !== undefined ? { nome } : {}),
    ...(email !== undefined ? { email } : {}),
    ...(matricula !== undefined ? { matricula: matricula ? matricula : null } : {}),
    ...(cargoNovo !== undefined ? { cargo: cargoNovo ? cargoNovo : null } : {}),
    ...(reparticaoId !== undefined ? { reparticaoId } : {}),
    ...(telefone !== undefined ? { telefone: telefone ? telefone : null } : {}),
    ...(telefoneWhatsapp !== undefined ? { telefoneWhatsapp } : {}),
  };
  // Sem telefone, não há WhatsApp.
  if (dados.telefone === null) dados.telefoneWhatsapp = false;
  // VALIDAÇÃO dos dados: validar carimba quem/quando; um dado que MUDOU desfaz a validação anterior (salvo se validou junto).
  const mudouDado = (Object.keys(dados) as (keyof typeof dados)[]).some((k) => (dados[k] ?? null) !== (antes[k] ?? null));
  const validacao =
    validar === true
      ? { dadosValidadosEm: sql`(CURRENT_TIMESTAMP)`, dadosValidadosPor: guard.u.nome }
      : validar === false || (mudouDado && antes.dadosValidadosEm)
        ? { dadosValidadosEm: null, dadosValidadosPor: null }
        : {};
  const set = { ...dados, ...validacao, ...(trocarSenha !== undefined ? { trocarSenha } : {}) };
  if (Object.keys(set).length > 0) {
    try {
      await db.update(usuarios).set({ ...set, atualizadoEm: sql`(CURRENT_TIMESTAMP)` }).where(eq(usuarios.id, id));
    } catch (e) {
      if (violouMatriculaUnica(e)) return erro(MSG_MATRICULA_EM_USO, 409);
      throw e;
    }
  }
  // Acesso LIBERADO (pendente → ativo): a pessoa recebe o aviso por e-mail (com o Resend ativo; depois da resposta).
  if (antes.status === "pendente" && status === "ativo") {
    const destino = email ?? antes.email;
    const quem = nome ?? antes.nome;
    depoisDaResposta(enviarEmailDireto([destino], (ctx) => emailAcessoLiberado({ nome: quem }, ctx)), "email");
  }
  // Log com destaque para PAPEL/STATUS (mudança de privilégio = alto valor).
  const cs = (["nome", "email", "matricula", "cargo", "reparticaoId", "telefone", "telefoneWhatsapp", "role", "status"] as const).filter((c) => corpo.data[c] !== undefined);
  const dd = diffCampos(antes as Record<string, unknown>, { ...corpo.data, ...dados } as Record<string, unknown>, cs, {
    nome: "nome",
    email: "e-mail",
    matricula: "matrícula",
    cargo: "cargo/função",
    reparticaoId: "unidade",
    telefone: "telefone",
    telefoneWhatsapp: "WhatsApp",
    role: "papel",
    status: "status",
  });
  // As ações do ADM sobre a conta (validar os dados, exigir senha nova) — só o FATO.
  const fatos = [
    validar === true ? "dados validados" : validar === false ? "validação dos dados desfeita" : mudouDado && antes.dadosValidadosEm ? "validação desfeita (dados alterados)" : "",
    trocarSenha === true && !antes.trocarSenha ? "senha nova exigida" : trocarSenha === false && antes.trocarSenha ? "exigência de senha nova dispensada" : "",
  ].filter(Boolean);
  await registrarAuditoria({
    usuario: guard.u,
    acao: "editar",
    entidade: "usuario",
    entidadeId: id,
    resumo: `Usuário ${antes.nome}: ${[dd.resumo, ...fatos].filter(Boolean).join("; ") || "editado"}`,
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
