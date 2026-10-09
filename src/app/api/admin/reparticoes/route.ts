import { and, asc, eq, ne, sql } from "drizzle-orm";
import { orgaos, reparticoes } from "@/db/schema";
import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getDb } from "@/lib/db";
import { CODIGO_GERAL } from "@/lib/escopo-unidades-core";
import { erro, ok, parseCorpo } from "@/lib/http";
import { contarUnidadesDoOrgao, numeroInteressadoEmUso } from "@/lib/orgaos";
import { reparticaoSchema } from "@/lib/rbac-validation";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  // Escopo opcional por órgão (?orgaoId=): a tela de unidades vive DENTRO de um órgão.
  const orgaoIdParam = new URL(req.url).searchParams.get("orgaoId");
  const orgaoId = orgaoIdParam && /^\d+$/.test(orgaoIdParam) ? Number(orgaoIdParam) : null;
  // A "Geral" é VIRTUAL (representa todas as unidades) — não entra no CRUD de unidades.
  const semGeral = ne(reparticoes.codigo, CODIGO_GERAL);
  const rows = await getDb()
    .select({
      id: reparticoes.id,
      codigo: reparticoes.codigo,
      nome: reparticoes.nome,
      ordem: reparticoes.ordem,
      numeroInteressado: reparticoes.numeroInteressado,
      setorRequisitante: reparticoes.setorRequisitante,
      orgaoId: reparticoes.orgaoId,
      orgaoProprio: reparticoes.orgaoProprio,
      oculto: reparticoes.oculto,
    })
    .from(reparticoes)
    .where(orgaoId != null ? and(semGeral, eq(reparticoes.orgaoId, orgaoId)) : semGeral)
    .orderBy(asc(reparticoes.ordem), asc(reparticoes.id));
  // Os responsáveis vêm da planilha (`GET /api/admin/responsaveis`).
  return ok({ reparticoes: rows });
}

export async function POST(req: Request) {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const corpo = await parseCorpo(reparticaoSchema, req);
  if ("resp" in corpo) return corpo.resp;
  // Um órgão que já funciona como unidade (tem a "unidade própria") não recebe unidades-filhas.
  if ((await contarUnidadesDoOrgao(corpo.data.orgaoId)).propriaId != null)
    return erro("Este órgão funciona como unidade (unidade própria) — não pode ter unidades-filhas. Desligue “Também unidade” no órgão para adicionar unidades.", 409);
  const [org] = await getDb().select({ id: orgaos.id }).from(orgaos).where(eq(orgaos.id, corpo.data.orgaoId)).limit(1);
  if (!org) return erro("Órgão não encontrado — toda unidade pertence a um órgão.", 422);
  const numeroInteressado = corpo.data.numeroInteressado?.trim() || null;
  // Ponto 3: Nº do interessado é ÚNICO GLOBAL (órgãos + unidades).
  if (numeroInteressado && (await numeroInteressadoEmUso(numeroInteressado)))
    return erro("Este Nº do interessado já está em uso por outro órgão ou unidade.", 409);
  const db = getDb();
  const [{ max }] = await db.select({ max: sql<number>`COALESCE(MAX(${reparticoes.ordem}), -1)` }).from(reparticoes);
  const [row] = await db
    .insert(reparticoes)
    .values({
      codigo: corpo.data.codigo,
      nome: corpo.data.nome,
      ordem: Number(max) + 1,
      numeroInteressado,
      setorRequisitante: corpo.data.setorRequisitante ?? null,
      orgaoId: corpo.data.orgaoId,
      oculto: corpo.data.oculto,
    })
    .returning({ id: reparticoes.id });
  await registrarAuditoria({ usuario: guard.u, acao: "criar", entidade: "reparticao", entidadeId: row?.id ?? null, resumo: `Unidade "${corpo.data.nome}" (${corpo.data.codigo}) criada`, depois: { codigo: corpo.data.codigo, nome: corpo.data.nome } });
  return ok({ id: row?.id });
}
