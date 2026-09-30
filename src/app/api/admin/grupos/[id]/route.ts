import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { grupoReparticoes, grupos, permissoes, usuarioGrupos } from "@/db/schema";
import { exigirAdmin, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getDb } from "@/lib/db";
import { erro, ok, parseCorpo } from "@/lib/http";
import { apagaConteudo, comandosMembros, comandosUnidades, impactoDoGrupo, motivoIdsInvalidos, textoImpactoGrupo } from "@/lib/rbac-sql";
import { grupoPatchSchema } from "@/lib/rbac-validation";

export const dynamic = "force-dynamic";

type Db = ReturnType<typeof getDb>;

/** O grupo como está (nome, permissão, pessoas e unidades) — `null` = não existe. */
async function lerGrupo(db: Db, id: number) {
  const [g] = await db.select({ nome: grupos.nome, permissaoId: grupos.permissaoId }).from(grupos).where(eq(grupos.id, id)).limit(1);
  if (!g) return null;
  const [membros, reps] = await Promise.all([
    db.select({ id: usuarioGrupos.usuarioId }).from(usuarioGrupos).where(eq(usuarioGrupos.grupoId, id)),
    db.select({ id: grupoReparticoes.reparticaoId }).from(grupoReparticoes).where(eq(grupoReparticoes.grupoId, id)),
  ]);
  return { ...g, membros: membros.map((m) => m.id), reparticoes: reps.map((r) => r.id) };
}

/** "+2 −1 pessoas" — o que entrou e o que saiu de uma lista de ids. */
function trocaIds(antes: number[], depois: number[], rotulo: string): string | null {
  const a = new Set(antes);
  const d = new Set(depois);
  const entrou = depois.filter((x) => !a.has(x)).length;
  const saiu = antes.filter((x) => !d.has(x)).length;
  if (!entrou && !saiu) return null;
  return `${rotulo}: ${[entrou ? `+${entrou}` : "", saiu ? `−${saiu}` : ""].filter(Boolean).join(" ")}`;
}

/** O IMPACTO de excluir o grupo (a tela confirma com ele antes). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const db = getDb();
  const [g] = await db.select({ nome: grupos.nome }).from(grupos).where(eq(grupos.id, id)).limit(1);
  if (!g) return erro("Grupo não encontrado.", 404);
  const impacto = await impactoDoGrupo(db, id);
  return ok({ nome: g.nome, impacto, texto: textoImpactoGrupo(impacto) });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const corpo = await parseCorpo(grupoPatchSchema, req);
  if ("resp" in corpo) return corpo.resp;
  const { nome, permissaoId, membros, reparticoes: reps } = corpo.data;
  const db = getDb();
  const antes = await lerGrupo(db, id);
  if (!antes) return erro("Grupo não encontrado.", 404);
  const invalido = await motivoIdsInvalidos(db, corpo.data);
  if (invalido) return erro(invalido, 422);

  // Tudo num LOTE: nome/permissão + pessoas + unidades (um id inválido nunca deixa o grupo pela metade).
  const comandos = [
    db
      .update(grupos)
      .set({
        ...(nome !== undefined ? { nome } : {}),
        ...(permissaoId !== undefined ? { permissaoId: permissaoId ?? null } : {}),
        atualizadoEm: sql`(CURRENT_TIMESTAMP)`,
      })
      .where(eq(grupos.id, id)),
    ...(membros !== undefined ? comandosMembros(db, id, membros) : []),
    ...(reps !== undefined ? comandosUnidades(db, id, reps) : []),
  ];
  await db.batch(comandos as [(typeof comandos)[number], ...(typeof comandos)[number][]]);

  const nomePerm = async (pid: number | null) =>
    pid == null ? "sem permissão" : ((await db.select({ nome: permissoes.nome }).from(permissoes).where(eq(permissoes.id, pid)).limit(1))[0]?.nome ?? `#${pid}`);
  const mudou = [
    nome !== undefined && nome !== antes.nome ? `nome: ${antes.nome} → ${nome}` : null,
    permissaoId !== undefined && (permissaoId ?? null) !== antes.permissaoId
      ? `permissão: ${await nomePerm(antes.permissaoId)} → ${await nomePerm(permissaoId ?? null)}`
      : null,
    membros !== undefined ? trocaIds(antes.membros, membros, "pessoas") : null,
    reps !== undefined ? trocaIds(antes.reparticoes, reps, "unidades") : null,
  ].filter((x): x is string => !!x);
  await registrarAuditoria({
    usuario: guard.u,
    acao: "editar",
    entidade: "grupo",
    entidadeId: id,
    resumo: `Grupo "${nome ?? antes.nome}"${mudou.length ? `: ${mudou.join("; ")}` : " salvo sem mudanças"}`,
    antes,
    depois: { nome: nome ?? antes.nome, permissaoId: permissaoId === undefined ? antes.permissaoId : permissaoId, membros: membros ?? antes.membros, reparticoes: reps ?? antes.reparticoes },
  });
  return ok();
}

/** Excluir o grupo CASCATEIA: quadros de tarefas (com as tarefas), pastas e modelos do grupo somem junto — sem
 * `?confirmar=1`, responde 409 com o impacto (a tela mostra e pede a confirmação). */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const db = getDb();
  const [g] = await db.select({ nome: grupos.nome }).from(grupos).where(eq(grupos.id, id)).limit(1);
  if (!g) return erro("Grupo não encontrado.", 404);
  const impacto = await impactoDoGrupo(db, id);
  if (apagaConteudo(impacto) && new URL(req.url).searchParams.get("confirmar") !== "1")
    return NextResponse.json({ ok: false, error: `Confirme a exclusão: ${textoImpactoGrupo(impacto)}`, impacto }, { status: 409 });
  await db.delete(grupos).where(eq(grupos.id, id));
  await registrarAuditoria({
    usuario: guard.u,
    acao: "excluir",
    entidade: "grupo",
    entidadeId: id,
    resumo: `Grupo "${g.nome}" excluído — ${textoImpactoGrupo(impacto)}`,
    antes: { nome: g.nome, ...impacto },
  });
  return ok();
}
