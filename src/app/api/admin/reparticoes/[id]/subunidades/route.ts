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
import { chaveCentro, conflitosCentros, lerCentros, motivoSubunidadesInvalidas, planoMover, ROTULO_MODO } from "@/lib/subunidades-core";
import { comandosGravarSubunidades, comandosTirarCentros } from "@/lib/subunidades-sql";

export const dynamic = "force-dynamic";

/** A unidade (não a "Geral") — `null` = inexistente. */
async function unidade(id: number) {
  const [r] = await getDb().select({ id: reparticoes.id, codigo: reparticoes.codigo, nome: reparticoes.nome }).from(reparticoes).where(eq(reparticoes.id, id)).limit(1);
  return r && !ehCodigoGeral(r.codigo) ? r : null;
}

/** O cadastro de CENTRO DE CUSTO da unidade: o modo, os centros, as subunidades (com os DFDs que as escolheram), as opções de centro de custo (os gravados nos DFDs)
 * e os centros que já são de subunidades de outras unidades. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  if (!id || !(await unidade(id))) return erro("Unidade não encontrada.", 404);
  const c = await cadastroDaUnidade(id);
  return c ? ok(c) : erro("Unidade não encontrada.", 404);
}

/** Grava o cadastro INTEIRO (o modo, os centros da unidade e a lista na ordem) num lote atômico. O centro de custo é
 * obrigatório (422) e pertence a um só cadastro do sistema (409); as subunidades que saem deixam sem subunidade os DFDs
 * em que estavam escolhidas. */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const u = await unidade(id);
  if (!u) return erro("Unidade não encontrada.", 404);
  const corpo = await parseCorpo(subunidadesSchema, req);
  if ("resp" in corpo) return corpo.resp;
  const modo = corpo.data.modo;
  const centros = lerCentros(corpo.data.centros);
  // No modo único o centro é da unidade: as subunidades nunca guardam centro próprio.
  const lista = corpo.data.subunidades.map((s) => ({ ...s, nome: s.nome.trim() || u.codigo, centros: modo === "unico" ? [] : lerCentros(s.centros) }));
  const motivo = motivoSubunidadesInvalidas(modo, centros, lista);
  if (motivo) return erro(motivo, 422);
  const antes = (await lerConfigSubunidades([id])).get(id);
  const deles = new Set((antes?.subunidades ?? []).map((s) => s.id));
  if (lista.some((s) => s.id != null && !deles.has(s.id))) return erro("Subunidade de outra unidade — recarregue a tela.", 422);
  // MOVER: só os centros que ficam neste cadastro saem do outro (o mesmo lote); o resto do conflito é recusado (409).
  const noCadastro = new Set([...centros, ...lista.flatMap((s) => s.centros)].map(chaveCentro));
  const mover = lerCentros(corpo.data.mover ?? []).filter((c) => noCadastro.has(chaveCentro(c)));
  const outras = await centrosDeOutrasUnidades(id);
  const plano = planoMover(mover, outras);
  const restantes = outras.map((o) => {
    const p = plano.find((x) => x.reparticaoId === o.reparticaoId && x.subunidadeId === o.subunidadeId);
    return p ? { ...o, centros: p.centros } : o;
  });
  const conflitos = conflitosCentros(centros, lista, restantes);
  if (conflitos.length) return erro(`Um centro de custo pertence a um só cadastro: ${conflitos.slice(0, 5).join("; ")}${conflitos.length > 5 ? "…" : ""}.`, 409);
  const db = getDb();
  const cmds = [...comandosTirarCentros(db, plano), ...comandosGravarSubunidades(db, id, modo, centros, lista)];
  await db.batch(cmds as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
  const texto = (c: string[], l: { nome: string; centros: string[] }[]) =>
    [c.length ? `centro ${c.join(" | ")}` : "", ...l.map((s) => (s.centros.length ? `${s.nome} (${s.centros.join(" | ")})` : s.nome))].filter(Boolean).join(", ") || "nenhum";
  await registrarAuditoria({
    usuario: g.u,
    acao: "editar",
    entidade: "reparticao",
    entidadeId: id,
    resumo: `Centro de custo de ${u.codigo}: ${ROTULO_MODO[antes?.modo ?? "unico"]} → ${ROTULO_MODO[modo]}; ${texto(antes?.centros ?? [], antes?.subunidades ?? [])} → ${texto(centros, lista)}`,
    antes: { modo: antes?.modo ?? "unico", centros: antes?.centros ?? [], subunidades: antes?.subunidades ?? [] },
    depois: { modo, centros, subunidades: lista },
  });
  for (const p of plano)
    await registrarAuditoria({
      usuario: g.u,
      acao: "editar",
      entidade: "reparticao",
      entidadeId: p.reparticaoId,
      resumo: `Centro de custo movido de ${p.rotulo} para ${u.codigo}: ${p.tirados.join(" | ")}`,
      antes: { centros: [...p.centros, ...p.tirados] },
      depois: { centros: p.centros },
    });
  const c = await cadastroDaUnidade(id);
  return ok(c ?? {});
}
