import { and, asc, eq, ne, sql } from "drizzle-orm";
import { reparticoes } from "@/db/schema";
import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getDb } from "@/lib/db";
import { erro, ok, parseCorpo } from "@/lib/http";
import { numeroInteressadoEmUso } from "@/lib/orgaos";
import { reparticaoSchema } from "@/lib/rbac-validation";
import { parseResponsaveis, serializeResponsaveis } from "@/lib/reparticao-responsaveis";

export const dynamic = "force-dynamic";

/** A "Geral" é VIRTUAL (representa todas as unidades) — não entra no CRUD de unidades. */
const CODIGO_GERAL = "GERAL";

export async function GET(req: Request) {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  // Escopo opcional por órgão (?orgaoId=): a tela de unidades vive DENTRO de um órgão.
  const orgaoIdParam = new URL(req.url).searchParams.get("orgaoId");
  const orgaoId = orgaoIdParam && /^\d+$/.test(orgaoIdParam) ? Number(orgaoIdParam) : null;
  const semGeral = ne(reparticoes.codigo, CODIGO_GERAL); // esconde a Geral virtual do cadastro
  const rows = await getDb()
    .select({
      id: reparticoes.id,
      codigo: reparticoes.codigo,
      nome: reparticoes.nome,
      ordem: reparticoes.ordem,
      numeroInteressado: reparticoes.numeroInteressado,
      setorRequisitante: reparticoes.setorRequisitante,
      orgaoId: reparticoes.orgaoId,
      oculto: reparticoes.oculto,
      responsavelDfd: reparticoes.responsavelDfd,
    })
    .from(reparticoes)
    .where(orgaoId != null ? and(semGeral, eq(reparticoes.orgaoId, orgaoId)) : semGeral)
    .orderBy(asc(reparticoes.ordem), asc(reparticoes.id));
  // A coluna guarda JSON; expõe como lista de nomes `responsaveis`.
  const lista = rows.map(({ responsavelDfd, ...r }) => ({ ...r, responsaveis: parseResponsaveis(responsavelDfd) }));
  return ok({ reparticoes: lista });
}

export async function POST(req: Request) {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const corpo = await parseCorpo(reparticaoSchema, req);
  if ("resp" in corpo) return corpo.resp;
  if (corpo.data.codigo.trim().toUpperCase() === CODIGO_GERAL)
    return erro("O código 'GERAL' é reservado à unidade virtual.", 400);
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
      orgaoId: corpo.data.orgaoId ?? null,
      oculto: corpo.data.oculto,
      responsavelDfd: serializeResponsaveis(corpo.data.responsaveis),
    })
    .returning({ id: reparticoes.id });
  await registrarAuditoria({ usuario: guard.u, acao: "criar", entidade: "reparticao", entidadeId: row?.id ?? null, resumo: `Unidade "${corpo.data.nome}" (${corpo.data.codigo}) criada`, depois: { codigo: corpo.data.codigo, nome: corpo.data.nome } });
  return ok({ id: row?.id });
}
