import { asc, sql } from "drizzle-orm";
import { orgaos } from "@/db/schema";
import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getDb } from "@/lib/db";
import { erro, ok, parseCorpo } from "@/lib/http";
import { estruturaPorOrgao, numeroInteressadoEmUso } from "@/lib/orgaos";
import { parseResponsaveis, serializeResponsaveis } from "@/lib/reparticao-responsaveis";
import { orgaoSchema } from "@/lib/rbac-validation";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const rows = await getDb()
    .select({
      id: orgaos.id,
      sigla: orgaos.sigla,
      nome: orgaos.nome,
      orgaoEntidade: orgaos.orgaoEntidade,
      ordem: orgaos.ordem,
      assinaturaUnica: orgaos.assinaturaUnica,
      numeroInteressado: orgaos.numeroInteressado,
      oculto: orgaos.oculto,
      responsavelDfd: orgaos.responsavelDfd,
    })
    .from(orgaos)
    .orderBy(asc(orgaos.ordem), asc(orgaos.id));
  // Estrutura (dual / tem unidades-filhas) para os badges e as travas de rebaixar/dual na UI.
  const estrutura = await estruturaPorOrgao();
  // A coluna guarda JSON; expõe como `responsaveis`.
  const lista = rows.map(({ responsavelDfd, ...o }) => ({
    ...o,
    responsaveis: parseResponsaveis(responsavelDfd),
    tambemUnidade: estrutura[o.id]?.tambemUnidade ?? false,
    temUnidades: estrutura[o.id]?.temUnidades ?? false,
  }));
  return ok({ orgaos: lista });
}

export async function POST(req: Request) {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const corpo = await parseCorpo(orgaoSchema, req);
  if ("resp" in corpo) return corpo.resp;
  const numeroInteressado = corpo.data.numeroInteressado?.trim() || null;
  // Ponto 3: Nº do interessado é ÚNICO GLOBAL (órgãos + unidades).
  if (numeroInteressado && (await numeroInteressadoEmUso(numeroInteressado)))
    return erro("Este Nº do interessado já está em uso por outro órgão ou unidade.", 409);
  const db = getDb();
  const [{ max }] = await db.select({ max: sql<number>`COALESCE(MAX(${orgaos.ordem}), -1)` }).from(orgaos);
  const [row] = await db
    .insert(orgaos)
    .values({
      sigla: corpo.data.sigla,
      nome: corpo.data.nome,
      orgaoEntidade: corpo.data.orgaoEntidade ?? null,
      numeroInteressado,
      assinaturaUnica: corpo.data.assinaturaUnica,
      oculto: corpo.data.oculto,
      responsavelDfd: serializeResponsaveis(corpo.data.responsaveis),
      ordem: Number(max) + 1,
    })
    .returning({ id: orgaos.id });
  await registrarAuditoria({ usuario: guard.u, acao: "criar", entidade: "orgao", entidadeId: row?.id ?? null, resumo: `Órgão "${corpo.data.nome}" (${corpo.data.sigla}) criado`, depois: { nome: corpo.data.nome, sigla: corpo.data.sigla } });
  return ok({ id: row?.id });
}
