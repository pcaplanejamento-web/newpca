import { eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { reparticoes } from "@/db/schema";
import { exigirAdmin, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getDb } from "@/lib/db";
import { ehCodigoGeral } from "@/lib/escopo-unidades-core";
import { erro, ok, parseCorpo } from "@/lib/http";
import { subunidadesSchema } from "@/lib/rbac-validation";
import { cadastroDaUnidade, centrosDeOutrasUnidades, lerConfigSubunidades } from "@/lib/subunidades";
import { conflitosCentros, lerCentros, motivoSubunidadesInvalidas, ROTULO_VINCULO } from "@/lib/subunidades-core";
import { comandosGravarSubunidades } from "@/lib/subunidades-sql";

export const dynamic = "force-dynamic";

/** A unidade (não a "Geral") — `null` = inexistente. */
async function unidade(id: number) {
  const [r] = await getDb().select({ id: reparticoes.id, codigo: reparticoes.codigo, nome: reparticoes.nome }).from(reparticoes).where(eq(reparticoes.id, id)).limit(1);
  return r && !ehCodigoGeral(r.codigo) ? r : null;
}

/** O cadastro das SUBUNIDADES da unidade: o vínculo, as subunidades (com os DFDs marcados), as opções de centro de custo
 * (os gravados nos DFDs) e os centros que já são de subunidades de outras unidades. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  if (!id || !(await unidade(id))) return erro("Unidade não encontrada.", 404);
  const c = await cadastroDaUnidade(id);
  return c ? ok(c) : erro("Unidade não encontrada.", 404);
}

/** Grava o cadastro INTEIRO (o vínculo + a lista na ordem) num lote atômico. Um centro de custo pertence a UMA subunidade
 * do sistema (409); as subunidades que saem deixam os DFDs marcados nelas sem subunidade. */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const u = await unidade(id);
  if (!u) return erro("Unidade não encontrada.", 404);
  const corpo = await parseCorpo(subunidadesSchema, req);
  if ("resp" in corpo) return corpo.resp;
  const lista = corpo.data.subunidades.map((s) => ({ ...s, nome: s.nome.trim(), centros: lerCentros(s.centros) }));
  const motivo = motivoSubunidadesInvalidas(lista);
  if (motivo) return erro(motivo, 422);
  const antes = (await lerConfigSubunidades([id])).get(id);
  const deles = new Set((antes?.subunidades ?? []).map((s) => s.id));
  if (lista.some((s) => s.id != null && !deles.has(s.id))) return erro("Subunidade de outra unidade — recarregue a tela.", 422);
  const conflitos = conflitosCentros(lista, await centrosDeOutrasUnidades(id));
  if (conflitos.length) return erro(`Um centro de custo pertence a uma subunidade: ${conflitos.slice(0, 5).join("; ")}${conflitos.length > 5 ? "…" : ""}.`, 409);
  const db = getDb();
  const cmds = comandosGravarSubunidades(db, id, corpo.data.vinculo, lista);
  await db.batch(cmds as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
  const nomes = (l: { nome: string }[]) => l.map((s) => s.nome).join(", ") || "nenhuma";
  await registrarAuditoria({
    usuario: g.u,
    acao: "editar",
    entidade: "reparticao",
    entidadeId: id,
    resumo: `Subunidades de ${u.codigo}: vínculo ${ROTULO_VINCULO[antes?.vinculo ?? "proprio"]} → ${ROTULO_VINCULO[corpo.data.vinculo]}; ${nomes(antes?.subunidades ?? [])} → ${nomes(lista)}`,
    antes: { vinculo: antes?.vinculo ?? "proprio", subunidades: antes?.subunidades ?? [] },
    depois: { vinculo: corpo.data.vinculo, subunidades: lista },
  });
  const c = await cadastroDaUnidade(id);
  return ok(c ?? {});
}
