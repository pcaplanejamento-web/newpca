import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import {
  dfdItens,
  dfdProtocolos,
  dfds,
  orcamentoItens,
  orcamentos,
  orcamentoVisoes,
  pcaDfds,
  pcaItens,
  pcas,
  reparticoes,
  unidades,
} from "@/db/schema";
import { TIPO_DFD_ROTULO, TIPOS_DFD } from "./avaliacao-core";
import { getDb } from "./db";
import { normUnidadeMedida } from "./normalize";
import { aplicarVisao, coerceFiltros, type FiltrosVisao, type VisaoOrcamento } from "./orcamento-visao";
import { alvoDoTexto, mapaVinculos } from "./orcamento-vinculo";
import { listarVinculosOrcamento } from "./orcamento";
import { tipoCurtoDfd } from "./parse-dfd-comum";
import {
  type AcaoDfdPca,
  agregarDashboard,
  coerceAcao,
  coerceFonte,
  coerceStatus,
  consolidarPca,
  type FontePca,
  type ItemDashboard,
  type LinhaVinculo,
  previsaoDoDfd,
  type StatusPca,
} from "./pca-core";
import { gravarSequencialNosItens, numerarItensDoProtocolo } from "./pca-itens-sql";
import type { Fatia, ItemRow, PontoMensal, Resumo, TopItem } from "./queries";
import { getItensTodos, getPorClassificacao, getPorMes, getPorUnidadeMedida, getResumo, getTopItens, getUnidades } from "./queries";
import { lotesDeIds } from "./reparticoes";

/**
 * Acesso a dados do PCA como ESPAÇO (card 4×5 → Dashboard · Orçamento · Mesa/Importação ·
 * Configuração). Só escopo de request (`getDb`). O núcleo puro (travas, ação sugerida,
 * consolidação, agregação) fica em `pca-core.ts`.
 */

export type PcaEspaco = {
  id: number;
  nome: string;
  ano: number | null;
  ativo: boolean;
  fonte: FontePca;
  status: StatusPca;
  /** URL da capa (`/api/pca/[id]/capa?v=…` — a imagem NÃO trafega nas listas) ou `null` = capa padrão. */
  capa: string | null;
  publicadoEm: string | null;
  orcamentoVisaoId: number | null;
};

export type PcaCard = PcaEspaco & {
  total: number;
  itens: number;
  /** Planilhas (lista) ou protocolos (protocolo) no PCA. */
  partes: number;
  dfds: number;
};

const COLS_PCA = {
  id: pcas.id,
  nome: pcas.nome,
  ano: pcas.ano,
  ativo: pcas.ativo,
  fonte: pcas.fonte,
  status: pcas.status,
  // Só a VERSÃO da capa (a data-URL fica no banco e sai pela rota da capa, com cache imutável).
  capaVersao: sql<string | null>`CASE WHEN ${pcas.capa} IS NULL OR ${pcas.capa} = '' THEN NULL ELSE COALESCE(${pcas.atualizadoEm}, '') || '-' || LENGTH(${pcas.capa}) END`,
  publicadoEm: pcas.publicadoEm,
  orcamentoVisaoId: pcas.orcamentoVisaoId,
};

type RowPca = { [K in keyof typeof COLS_PCA]: unknown };
function paraEspaco(r: RowPca): PcaEspaco {
  return {
    id: Number(r.id),
    nome: String(r.nome ?? ""),
    ano: r.ano == null ? null : Number(r.ano),
    ativo: !!r.ativo,
    fonte: coerceFonte(r.fonte),
    status: coerceStatus(r.status),
    capa: r.capaVersao ? `/api/pca/${Number(r.id)}/capa?v=${encodeURIComponent(String(r.capaVersao))}` : null,
    publicadoEm: (r.publicadoEm as string | null) ?? null,
    orcamentoVisaoId: r.orcamentoVisaoId == null ? null : Number(r.orcamentoVisaoId),
  };
}

/** A data-URL da capa (a rota `/api/pca/[id]/capa` a serve como imagem). */
export async function capaDoPca(id: number): Promise<string | null> {
  const [r] = await getDb().select({ capa: pcas.capa }).from(pcas).where(eq(pcas.id, id)).limit(1);
  return r?.capa ?? null;
}

export async function getPcaEspaco(id: number): Promise<PcaEspaco | null> {
  const [r] = await getDb().select(COLS_PCA).from(pcas).where(eq(pcas.id, id)).limit(1);
  return r ? paraEspaco(r) : null;
}

// ---------------------------------------------------------------------------
// Vínculos de DFD (fonte protocolo)
// ---------------------------------------------------------------------------

/** Um DFD vinculado a um PCA, com o protocolo de origem e os totais. */
export type VinculoDfd = LinhaVinculo & {
  pcaId: number;
  protocoloId: number | null;
  valorTotal: number;
  totalItens: number;
  reparticaoId: number | null;
};

async function vinculos(pcaIds?: number[]): Promise<VinculoDfd[]> {
  const rows = await getDb()
    .select({
      pcaId: pcaDfds.pcaId,
      dfdId: pcaDfds.dfdId,
      acao: pcaDfds.acao,
      vinculadoEm: pcaDfds.vinculadoEm,
      planejamento: dfds.planejamento,
      valorTotal: dfds.valorTotal,
      totalItens: dfds.totalItens,
      reparticaoId: dfds.reparticaoId,
      protocoloId: dfds.protocoloId,
      protocoladoEm: dfdProtocolos.criadoEm,
    })
    .from(pcaDfds)
    .innerJoin(dfds, eq(pcaDfds.dfdId, dfds.id))
    .leftJoin(dfdProtocolos, eq(dfds.protocoloId, dfdProtocolos.id))
    .where(pcaIds ? inArray(pcaDfds.pcaId, pcaIds) : undefined);
  return rows.map((r) => ({
    pcaId: r.pcaId,
    dfdId: r.dfdId,
    acao: coerceAcao(r.acao),
    planejamento: r.planejamento,
    ordem: `${r.protocoladoEm ?? ""}|${r.vinculadoEm ?? ""}`,
    protocoloId: r.protocoloId,
    valorTotal: Number(r.valorTotal ?? 0),
    totalItens: Number(r.totalItens ?? 0),
    reparticaoId: r.reparticaoId,
  }));
}

export async function vinculosDoPca(pcaId: number): Promise<VinculoDfd[]> {
  return vinculos([pcaId]);
}

/** Itens INATIVOS (retirados do PCA / de DFD que deixou de ser vigente) por `pcaId:dfdId` — nº + Σ valor. */
async function inativosPorDfd(): Promise<Map<string, { n: number; valor: number }>> {
  const rows = await getDb()
    .select({ pcaId: pcaItens.pcaId, dfdId: pcaItens.dfdId, n: sql<number>`COUNT(*)`, valor: sql<number>`COALESCE(SUM(${dfdItens.valorTotal}), 0)` })
    .from(pcaItens)
    .innerJoin(dfdItens, eq(pcaItens.dfdItemId, dfdItens.id))
    .where(eq(pcaItens.ativo, false))
    .groupBy(pcaItens.pcaId, pcaItens.dfdId);
  return new Map(rows.map((r) => [`${r.pcaId}:${r.dfdId}`, { n: Number(r.n), valor: Number(r.valor) }]));
}

/** Cards da tela `/painel/pca` (totais = os itens ATIVOS dos DFDs vigentes). */
export async function listarPcasCards(): Promise<PcaCard[]> {
  const db = getDb();
  const [rows, porPlanilha, todos, inativos] = await Promise.all([
    db.select(COLS_PCA).from(pcas).orderBy(desc(pcas.ano), desc(pcas.id)),
    db
      .select({
        pcaId: unidades.pcaId,
        n: sql<number>`COUNT(*)`,
        itens: sql<number>`COALESCE(SUM(${unidades.totalItens}), 0)`,
        total: sql<number>`COALESCE(SUM(${unidades.valorTotal}), 0)`,
      })
      .from(unidades)
      .groupBy(unidades.pcaId),
    vinculos(),
    inativosPorDfd(),
  ]);
  const plan = new Map(porPlanilha.map((p) => [p.pcaId, p]));
  const porPca = new Map<number, VinculoDfd[]>();
  for (const v of todos) {
    const l = porPca.get(v.pcaId);
    if (l) l.push(v);
    else porPca.set(v.pcaId, [v]);
  }
  return rows.map((r) => {
    const p = paraEspaco(r);
    if (p.fonte === "lista") {
      const s = plan.get(p.id);
      return { ...p, total: Number(s?.total ?? 0), itens: Number(s?.itens ?? 0), partes: Number(s?.n ?? 0), dfds: 0 };
    }
    const vs = porPca.get(p.id) ?? [];
    const vig = new Set(consolidarPca(vs).vigentes);
    const ativos = vs.filter((v) => vig.has(v.dfdId));
    const fora = (v: VinculoDfd) => inativos.get(`${p.id}:${v.dfdId}`) ?? { n: 0, valor: 0 };
    return {
      ...p,
      total: ativos.reduce((s, v) => s + v.valorTotal - fora(v).valor, 0),
      itens: ativos.reduce((s, v) => s + v.totalItens - fora(v).n, 0),
      partes: new Set(vs.map((v) => v.protocoloId).filter((x) => x != null)).size,
      dfds: ativos.length,
    };
  });
}

/** PCAs PUBLICADOS (seletor da tela inicial) — o ativo primeiro, depois o ano mais recente. */
export async function listarPcasPublicados(): Promise<{ id: number; nome: string; ano: number | null; fonte: FontePca; ativo: boolean }[]> {
  const rows = await getDb()
    .select({ id: pcas.id, nome: pcas.nome, ano: pcas.ano, fonte: pcas.fonte, ativo: pcas.ativo })
    .from(pcas)
    .where(eq(pcas.status, "publicado"))
    .orderBy(desc(pcas.ativo), desc(pcas.ano), desc(pcas.id));
  return rows.map((r) => ({ id: r.id, nome: r.nome, ano: r.ano, fonte: coerceFonte(r.fonte), ativo: !!r.ativo }));
}

// ---------------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------------

export async function criarPcaEspaco(d: { nome: string; ano: number; fonte: FontePca }, criadoPor: number | null): Promise<number> {
  const [r] = await getDb()
    .insert(pcas)
    .values({ nome: d.nome, ano: d.ano, fonte: d.fonte, status: "preview", criadoPor })
    .returning({ id: pcas.id });
  return r.id;
}

export type CamposPcaEspaco = Partial<{
  nome: string;
  ano: number;
  fonte: FontePca;
  status: StatusPca;
  capa: string | null;
  orcamentoVisaoId: number | null;
}>;

export async function atualizarPcaEspaco(id: number, c: CamposPcaEspaco): Promise<void> {
  const set: Record<string, unknown> = { atualizadoEm: sql`(CURRENT_TIMESTAMP)` };
  for (const k of ["nome", "ano", "fonte", "capa", "orcamentoVisaoId"] as const) if (c[k] !== undefined) set[k] = c[k];
  if (c.status !== undefined) {
    set.status = c.status;
    set.publicadoEm = c.status === "publicado" ? sql`(CURRENT_TIMESTAMP)` : null;
  }
  await getDb().update(pcas).set(set).where(eq(pcas.id, id));
}

/** O PCA já tem dados (planilhas ou DFDs)? — trava a troca de fonte. */
export async function pcaTemDados(id: number): Promise<{ planilhas: number; dfds: number }> {
  const db = getDb();
  const [[a], [b]] = await Promise.all([
    db.select({ n: sql<number>`COUNT(*)` }).from(unidades).where(eq(unidades.pcaId, id)),
    db.select({ n: sql<number>`COUNT(*)` }).from(pcaDfds).where(eq(pcaDfds.pcaId, id)),
  ]);
  return { planilhas: Number(a?.n ?? 0), dfds: Number(b?.n ?? 0) };
}

/** DFDs (dos ids dados) já vinculados a OUTRO PCA — `dfdId → pcaId`. */
export async function dfdsEmOutroPca(dfdIds: number[], pcaId: number): Promise<Map<number, number>> {
  const m = new Map<number, number>();
  for (const lote of lotesDeIds(dfdIds)) {
    const rows = await getDb()
      .select({ dfdId: pcaDfds.dfdId, pcaId: pcaDfds.pcaId })
      .from(pcaDfds)
      .where(and(inArray(pcaDfds.dfdId, lote), ne(pcaDfds.pcaId, pcaId)));
    for (const r of rows) m.set(r.dfdId, r.pcaId);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Mesa do PCA: enviar · devolver · incorporar (PERMANENTE, `0034`) + sequencial do item (`0035`)
// ---------------------------------------------------------------------------

/** ENVIA o protocolo à Mesa do PCA (sai da Mesa principal). Só se ainda não está em um PCA. */
export async function enviarProtocolo(pcaId: number, protocoloId: number, usuarioId: number | null): Promise<void> {
  await getDb()
    .update(dfdProtocolos)
    .set({ pcaId, pcaEnviadoEm: sql`(CURRENT_TIMESTAMP)`, pcaEnviadoPor: usuarioId, pcaIncorporadoEm: null })
    .where(and(eq(dfdProtocolos.id, protocoloId), isNull(dfdProtocolos.pcaId)));
}

/** DEVOLVE o protocolo à Mesa principal. Só o enviado a ESTE PCA e NÃO incorporado. */
export async function devolverProtocolo(pcaId: number, protocoloId: number): Promise<void> {
  await getDb()
    .update(dfdProtocolos)
    .set({ pcaId: null, pcaEnviadoEm: null, pcaEnviadoPor: null })
    .where(and(eq(dfdProtocolos.id, protocoloId), eq(dfdProtocolos.pcaId, pcaId), isNull(dfdProtocolos.pcaIncorporadoEm)));
}

/**
 * INCORPORA o protocolo ao PCA (PERMANENTE) num lote ATÔMICO: vincula os DFDs dele (`pca_dfds`, com a ação de cada
 * um), NUMERA os itens com o sequencial único do PCA (`pca_itens` + o próprio item — `pca-itens-sql.ts`) e marca a
 * incorporação (protocolo/DFDs/itens TRAVADOS). Depois, inativa os números dos DFDs que deixaram de ser vigentes.
 */
export async function incorporarProtocolo(
  pcaId: number,
  protocoloId: number,
  entradas: { dfdId: number; acao: AcaoDfdPca }[],
  usuarioId: number | null,
): Promise<void> {
  const db = getDb();
  // 5 parâmetros por linha → 18 linhas por statement (90 < 100 do D1).
  const stmts = [];
  for (let i = 0; i < entradas.length; i += 18) {
    stmts.push(
      db
        .insert(pcaDfds)
        .values(entradas.slice(i, i + 18).map((e) => ({ pcaId, dfdId: e.dfdId, acao: e.acao, vinculadoPor: usuarioId, vinculadoEm: sql`(CURRENT_TIMESTAMP)` })))
        .onConflictDoUpdate({ target: [pcaDfds.pcaId, pcaDfds.dfdId], set: { acao: sql`excluded.acao` } }),
    );
  }
  const marca = db
    .update(dfdProtocolos)
    .set({ pcaIncorporadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(and(eq(dfdProtocolos.id, protocoloId), eq(dfdProtocolos.pcaId, pcaId)));
  await db.batch([
    ...stmts,
    numerarItensDoProtocolo(db, pcaId, protocoloId),
    gravarSequencialNosItens(db, pcaId, protocoloId),
    marca,
  ] as unknown as [typeof marca, ...(typeof marca)[]]);
  await sincronizarAtivosPca(pcaId, usuarioId);
}

/** Inativa os números dos itens cujo DFD deixou de ser VIGENTE no PCA (substituído/excluído por outro protocolo). */
async function sincronizarAtivosPca(pcaId: number, usuarioId: number | null): Promise<void> {
  const db = getDb();
  const [vs, numerados] = await Promise.all([
    vinculosDoPca(pcaId),
    db
      .selectDistinct({ dfdId: pcaItens.dfdId })
      .from(pcaItens)
      .where(and(eq(pcaItens.pcaId, pcaId), eq(pcaItens.ativo, true))),
  ]);
  const vig = new Set(consolidarPca(vs).vigentes);
  const fora = numerados.map((r) => r.dfdId).filter((id): id is number => id != null && !vig.has(id));
  for (const lote of lotesDeIds(fora))
    await db
      .update(pcaItens)
      .set({ ativo: false, inativadoEm: sql`(CURRENT_TIMESTAMP)`, inativadoPor: usuarioId, motivo: "DFD substituído/excluído no PCA" })
      .where(and(eq(pcaItens.pcaId, pcaId), eq(pcaItens.ativo, true), inArray(pcaItens.dfdId, lote)));
}

/** Itens numerados do PCA entre os `dfd_itens.id` dados — com a unidade do DFD (escopo) e o estado do número. */
export async function itensNumeradosDoPca(
  pcaId: number,
  dfdItemIds: number[],
): Promise<{ dfdItemId: number; sequencial: number; ativo: boolean; reparticaoId: number | null; dfdNumero: string | null }[]> {
  const out: { dfdItemId: number; sequencial: number; ativo: boolean; reparticaoId: number | null; dfdNumero: string | null }[] = [];
  for (const lote of lotesDeIds(dfdItemIds)) {
    const rows = await getDb()
      .select({ dfdItemId: pcaItens.dfdItemId, sequencial: pcaItens.sequencial, ativo: pcaItens.ativo, reparticaoId: dfds.reparticaoId, dfdNumero: dfds.numero })
      .from(pcaItens)
      .leftJoin(dfds, eq(pcaItens.dfdId, dfds.id))
      .where(and(eq(pcaItens.pcaId, pcaId), inArray(pcaItens.dfdItemId, lote)));
    for (const r of rows) if (r.dfdItemId != null) out.push({ ...r, dfdItemId: r.dfdItemId });
  }
  return out;
}

/** RETIRA itens do PCA: o número fica INATIVO (nunca reaproveitado) e o item sai do Dashboard/Orçamento. */
export async function retirarItensDoPca(pcaId: number, dfdItemIds: number[], usuarioId: number | null): Promise<void> {
  for (const lote of lotesDeIds(dfdItemIds))
    await getDb()
      .update(pcaItens)
      .set({ ativo: false, inativadoEm: sql`(CURRENT_TIMESTAMP)`, inativadoPor: usuarioId, motivo: "Retirado do PCA" })
      .where(and(eq(pcaItens.pcaId, pcaId), eq(pcaItens.ativo, true), inArray(pcaItens.dfdItemId, lote)));
}

// ---------------------------------------------------------------------------
// Dashboard (as MESMAS formas do público)
// ---------------------------------------------------------------------------

export type DashboardPca = {
  resumo: Resumo;
  porClassificacao: Fatia[];
  porMes: PontoMensal[];
  porUnidadeMedida: Fatia[];
  top: TopItem[];
  itens: ItemRow[];
  /** Filtro por unidade (planilha na lista; unidade requisitante no protocolo). */
  unidades: { id: number; codigo: string; municipio: string }[];
  unidadeId?: number;
  /** Protocolos incorporados ao PCA (só fonte protocolo). */
  protocolos: number;
  dfds: number;
};

const vazioDash = (): DashboardPca => ({
  resumo: { total: 0, count: 0, ticket: 0, maiorNome: null, maiorValor: 0, numUnidades: 0 },
  porClassificacao: [],
  porMes: [],
  porUnidadeMedida: [],
  top: [],
  itens: [],
  unidades: [],
  protocolos: 0,
  dfds: 0,
});

/**
 * Itens VIGENTES (consolidados) de um PCA de fonte protocolo, achatados p/ o dashboard: só os itens ATIVOS
 * (retirado do PCA = fora) e com o SEQUENCIAL do PCA (o item legado sem número usa o dele no DFD).
 */
export async function itensConsolidados(pca: PcaEspaco) {
  const db = getDb();
  const [vs, numeros] = await Promise.all([
    vinculosDoPca(pca.id),
    db.select({ dfdItemId: pcaItens.dfdItemId, sequencial: pcaItens.sequencial, ativo: pcaItens.ativo }).from(pcaItens).where(eq(pcaItens.pcaId, pca.id)),
  ]);
  const cons = consolidarPca(vs);
  const numero = new Map(numeros.filter((n) => n.dfdItemId != null).map((n) => [n.dfdItemId as number, n]));
  const meta = new Map<number, { numero: string; tipo: string | null; secoes: string | null; anoPca: number | null; reparticaoId: number | null; sigla: string | null }>();
  const itens: (ItemDashboard & { dfdId: number; reparticaoId: number | null })[] = [];
  for (const lote of lotesDeIds(cons.vigentes)) {
    const [ds, its] = await Promise.all([
      db
        .select({
          id: dfds.id,
          numero: dfds.numero,
          tipo: dfds.tipo,
          secoes: dfds.secoes,
          anoPca: dfds.anoPca,
          reparticaoId: dfds.reparticaoId,
          sigla: reparticoes.codigo,
        })
        .from(dfds)
        .leftJoin(reparticoes, eq(dfds.reparticaoId, reparticoes.id))
        .where(inArray(dfds.id, lote)),
      db.select().from(dfdItens).where(inArray(dfdItens.dfdId, lote)).orderBy(asc(dfdItens.dfdId), asc(dfdItens.sequencial)),
    ]);
    for (const d of ds) meta.set(d.id, d);
    for (const it of its) {
      const n = numero.get(it.id);
      if (n && !n.ativo) continue; // retirado do PCA
      const d = meta.get(it.dfdId);
      let secoes: { titulo?: string; texto?: string }[] = [];
      try {
        secoes = d?.secoes ? (JSON.parse(d.secoes) as typeof secoes) : [];
      } catch {
        secoes = [];
      }
      const curto = tipoCurtoDfd(d?.tipo);
      itens.push({
        id: it.id,
        dfdId: it.dfdId,
        reparticaoId: d?.reparticaoId ?? null,
        codigoProduto: it.codigo,
        sequencial: n?.sequencial ?? it.item ?? it.sequencial,
        nome: it.descricao,
        unidadeMedida: it.unidade ? normUnidadeMedida(it.unidade) : null,
        quantidade: it.quantidade,
        valorUnitario: it.valorUnitario,
        valorTotal: Number(it.valorTotal ?? 0),
        classificacao: curto && (TIPOS_DFD as readonly string[]).includes(curto) ? TIPO_DFD_ROTULO[curto as (typeof TIPOS_DFD)[number]] : "Sem tipo",
        previsao: previsaoDoDfd(secoes, d?.anoPca ?? pca.ano),
        unidade: d?.sigla ?? null,
        origem: d ? `DFD ${d.numero}` : null,
      });
    }
  }
  const protocolos = new Set(vs.map((v) => v.protocoloId).filter((x): x is number => x != null));
  return { itens, vinculos: vs, consolidacao: cons, protocolos: protocolos.size };
}

/** Dados do dashboard do PCA — o MESMO no painel e na tela inicial. */
export async function dashboardDoPca(pca: PcaEspaco, unidadeIdPedida?: number): Promise<DashboardPca> {
  if (pca.fonte === "lista") {
    const us = await getUnidades(undefined, pca.id);
    if (us.length === 0) return vazioDash();
    const unidadeId = unidadeIdPedida && us.some((u) => u.id === unidadeIdPedida) ? unidadeIdPedida : undefined;
    const [resumo, porClassificacao, porMes, porUnidadeMedida, top, itens] = await Promise.all([
      getResumo(unidadeId, pca.id),
      getPorClassificacao(unidadeId, pca.id),
      getPorMes(unidadeId, pca.id),
      getPorUnidadeMedida(unidadeId, pca.id),
      getTopItens(unidadeId, 10, pca.id),
      getItensTodos(unidadeId, 5000, pca.id),
    ]);
    return { resumo, porClassificacao, porMes, porUnidadeMedida, top, itens, unidades: us, unidadeId, protocolos: 0, dfds: 0 };
  }
  const c = await itensConsolidados(pca);
  const reps = new Map<number, string>();
  for (const i of c.itens) if (i.reparticaoId != null && i.unidade) reps.set(i.reparticaoId, i.unidade);
  const unidadeId = unidadeIdPedida && reps.has(unidadeIdPedida) ? unidadeIdPedida : undefined;
  const lista = unidadeId ? c.itens.filter((i) => i.reparticaoId === unidadeId) : c.itens;
  const ag = agregarDashboard(lista);
  const itens: ItemRow[] = lista
    .slice()
    .sort((a, b) => b.valorTotal - a.valorTotal)
    .slice(0, 5000)
    .map((i) => ({
      id: i.id,
      idProduto: i.codigoProduto,
      sequencial: i.sequencial,
      nomeProduto: i.nome,
      unidadeMedida: i.unidadeMedida,
      quantidade: i.quantidade,
      valorReferencia: i.valorUnitario,
      valorTotal: i.valorTotal,
      classificacao: i.classificacao,
      dataDesejada: i.previsao && !("anual" in i.previsao) ? `${i.previsao.ano}-${String(i.previsao.mes).padStart(2, "0")}-01` : null,
      codigo: i.unidade,
      municipio: i.origem,
    }));
  return {
    ...ag,
    itens,
    unidades: [...reps].map(([id, sigla]) => ({ id, codigo: sigla, municipio: "" })).sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR")),
    unidadeId,
    protocolos: c.protocolos,
    dfds: new Set(lista.map((i) => i.dfdId)).size,
  };
}

// ---------------------------------------------------------------------------
// Orçamento do PCA
// ---------------------------------------------------------------------------

function paraVisao(r: { id: number; nome: string; filtros: string; ordem: number }): VisaoOrcamento {
  return { id: r.id, nome: r.nome, ordem: r.ordem, filtros: coerceFiltros(r.filtros) };
}

export async function listarVisoesOrcamento(): Promise<VisaoOrcamento[]> {
  const rows = await getDb().select().from(orcamentoVisoes).orderBy(asc(orcamentoVisoes.ordem), asc(orcamentoVisoes.id));
  return rows.map(paraVisao);
}

export async function getVisaoOrcamento(id: number): Promise<VisaoOrcamento | null> {
  const [r] = await getDb().select().from(orcamentoVisoes).where(eq(orcamentoVisoes.id, id)).limit(1);
  return r ? paraVisao(r) : null;
}

export async function criarVisaoOrcamento(nome: string, filtros: FiltrosVisao): Promise<number> {
  const db = getDb();
  const [{ max }] = await db.select({ max: sql<number>`COALESCE(MAX(${orcamentoVisoes.ordem}), -1)` }).from(orcamentoVisoes);
  const [r] = await db
    .insert(orcamentoVisoes)
    .values({ nome, filtros: JSON.stringify(filtros), ordem: Number(max) + 1 })
    .returning({ id: orcamentoVisoes.id });
  return r.id;
}

export async function atualizarVisaoOrcamento(id: number, nome: string, filtros: FiltrosVisao): Promise<void> {
  await getDb()
    .update(orcamentoVisoes)
    .set({ nome, filtros: JSON.stringify(filtros), atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(orcamentoVisoes.id, id));
}

export async function excluirVisaoOrcamento(id: number): Promise<void> {
  await getDb().delete(orcamentoVisoes).where(eq(orcamentoVisoes.id, id));
}

export type OrcamentoDoPca = {
  orcamento: { id: number; nome: string; ano: number } | null;
  visao: VisaoOrcamento | null;
  bruto: number;
  filtrado: number;
  /** Lançamentos filtrados com a unidade do sistema (vínculo) — base do comparativo. */
  linhas: { unidadeId: number | null; valor: number }[];
  /** Planejado do PCA por unidade (itens ativos). */
  planejado: { unidadeId: number | null; itens: number; valor: number }[];
  unidades: { id: number; sigla: string; nome: string }[];
};

/** Orçamento (CUBO do MESMO ano) filtrado pela visão do PCA + o planejado por unidade. */
export async function orcamentoDoPca(pca: PcaEspaco): Promise<OrcamentoDoPca> {
  const db = getDb();
  const [orc] =
    pca.ano != null
      ? await db
          .select({ id: orcamentos.id, nome: orcamentos.nome, ano: orcamentos.ano })
          .from(orcamentos)
          .where(eq(orcamentos.ano, pca.ano))
          .orderBy(desc(orcamentos.id))
          .limit(1)
      : [];
  const [visao, reps, vincs] = await Promise.all([
    pca.orcamentoVisaoId ? getVisaoOrcamento(pca.orcamentoVisaoId) : Promise.resolve(null),
    db.select({ id: reparticoes.id, sigla: reparticoes.codigo, nome: reparticoes.nome }).from(reparticoes).where(ne(sql`UPPER(${reparticoes.codigo})`, "GERAL")),
    listarVinculosOrcamento(),
  ]);
  let bruto = 0;
  let filtrado = 0;
  let linhas: OrcamentoDoPca["linhas"] = [];
  if (orc) {
    const itens = await db
      .select({ orgao: orcamentoItens.orgao, unidade: orcamentoItens.unidade, nomeElemento: orcamentoItens.nomeElemento, codigoElemento: orcamentoItens.codigoElemento, valor: orcamentoItens.valorInicial })
      .from(orcamentoItens)
      .where(eq(orcamentoItens.orcamentoId, orc.id));
    bruto = itens.reduce((s, i) => s + Number(i.valor ?? 0), 0);
    const f = aplicarVisao(itens, visao?.filtros);
    filtrado = f.reduce((s, i) => s + Number(i.valor ?? 0), 0);
    const mapa = mapaVinculos(vincs);
    linhas = f.map((i) => ({ unidadeId: alvoDoTexto(mapa, "unidade", i.unidade), valor: Number(i.valor ?? 0) }));
  }

  // Planejado por unidade.
  const acc = new Map<number | null, { itens: number; valor: number }>();
  const soma = (id: number | null, n: number, v: number) => {
    const a = acc.get(id) ?? { itens: 0, valor: 0 };
    a.itens += n;
    a.valor += v;
    acc.set(id, a);
  };
  if (pca.fonte === "lista") {
    const porSigla = new Map(reps.map((r) => [r.sigla.trim().toUpperCase(), r.id]));
    for (const u of await getUnidades(undefined, pca.id))
      soma(u.reparticaoId ?? porSigla.get(u.codigo.trim().toUpperCase()) ?? null, Number(u.totalItens ?? 0), Number(u.valorTotal ?? 0));
  } else {
    for (const i of (await itensConsolidados(pca)).itens) soma(i.reparticaoId, 1, i.valorTotal);
  }
  return {
    orcamento: orc ?? null,
    visao,
    bruto,
    filtrado,
    linhas,
    planejado: [...acc].map(([unidadeId, a]) => ({ unidadeId, ...a })),
    unidades: reps,
  };
}

/** DFDs (id + protocolo) dos protocolos dados. */
export async function dfdsDosProtocolos(protocoloIds: number[]): Promise<{ id: number; protocoloId: number }[]> {
  const out: { id: number; protocoloId: number }[] = [];
  for (const lote of lotesDeIds(protocoloIds)) {
    const rows = await getDb().select({ id: dfds.id, protocoloId: dfds.protocoloId }).from(dfds).where(inArray(dfds.protocoloId, lote));
    for (const r of rows) if (r.protocoloId != null) out.push({ id: r.id, protocoloId: r.protocoloId });
  }
  return out;
}
