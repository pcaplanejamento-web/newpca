import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
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
import { historicoDfd, historicoProtocolo } from "./auditoria";
import type { DfdPrevisao } from "./calendario-core";
import type { LinhaHistorico } from "./auditoria-core";
import { TIPO_DFD_ROTULO, TIPOS_DFD } from "./avaliacao-core";
import { getDb } from "./db";
import { getDfd } from "./dfd";
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
import { type DfdConsulta, dfdPublico, historicoPublico, mascararTexto } from "./pca-publico-core";
import { getProtocolo } from "./protocolo";
import type { Fatia, ItemRow, PontoMensal, Resumo, TopItem } from "./queries";
import { getItensTodos, getPorClassificacao, getPorMes, getPorUnidadeMedida, getResumo, getTopItens, getUnidades } from "./queries";
import { solicitanteDeResultado, validarAssinatura } from "./reparticao-responsaveis";
import { carregarResponsaveis, lotesDeIds } from "./reparticoes";

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

/** Um DFD vigente do PCA (visão "DFDs" da consulta do Dashboard). */
export type DfdDoPca = {
  id: number;
  protocoloId: number | null;
  numero: string;
  planejamento: string | null;
  tipo: string | null;
  sigla: string | null;
  protocoloNumero: string | null;
  itens: number;
  valor: number;
};

/** Um protocolo INCORPORADO ao PCA (visão "Protocolos" da consulta) — os totais dos itens ATIVOS. */
export type ProtocoloDoPca = {
  id: number;
  numero: string;
  assunto: string | null;
  sigla: string | null;
  dfds: number;
  itens: number;
  valor: number;
};

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
  /** DFDs VIGENTES do PCA com os totais dos itens ATIVOS (só fonte protocolo — a visão "DFDs" do painel). */
  dfdsLista: DfdDoPca[];
  /** Protocolos incorporados (visão "Protocolos" da consulta; só fonte protocolo). */
  protocolosLista: ProtocoloDoPca[];
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
  dfdsLista: [],
  protocolosLista: [],
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
  const meta = new Map<
    number,
    {
      numero: string;
      planejamento: string | null;
      tipo: string | null;
      secoes: string | null;
      anoPca: number | null;
      reparticaoId: number | null;
      sigla: string | null;
      protocoloId: number | null;
      protocoloNumero: string | null;
      protocoloAssunto: string | null;
      protocoloSigla: string | null;
    }
  >();
  const itens: (ItemDashboard & { dfdId: number; reparticaoId: number | null; itemNumero: number | null })[] = [];
  for (const lote of lotesDeIds(cons.vigentes)) {
    const [ds, its] = await Promise.all([
      db
        .select({
          id: dfds.id,
          numero: dfds.numero,
          planejamento: dfds.planejamento,
          tipo: dfds.tipo,
          secoes: dfds.secoes,
          anoPca: dfds.anoPca,
          reparticaoId: dfds.reparticaoId,
          sigla: reparticoes.codigo,
          protocoloId: dfds.protocoloId,
          protocoloNumero: dfdProtocolos.numero,
          protocoloAssunto: dfdProtocolos.assunto,
          protocoloSigla: sql<string | null>`(SELECT r.codigo FROM reparticoes r WHERE r.id = ${dfdProtocolos.reparticaoId})`,
        })
        .from(dfds)
        .leftJoin(reparticoes, eq(dfds.reparticaoId, reparticoes.id))
        .leftJoin(dfdProtocolos, eq(dfds.protocoloId, dfdProtocolos.id))
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
        itemNumero: it.item,
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
  return { itens, meta, vinculos: vs, consolidacao: cons, protocolos: protocolos.size };
}

type Consolidados = Awaited<ReturnType<typeof itensConsolidados>>;

/** Item consolidado → a linha da tabela de itens (Dashboard e origem do Orçamento), com a ORIGEM (protocolo/DFD/mês). */
function itemRowConsolidado(i: Consolidados["itens"][number], meta: Consolidados["meta"]): ItemRow {
  const p = i.previsao;
  const anual = !!p && "anual" in p;
  return {
    id: i.id,
    idProduto: i.codigoProduto,
    sequencial: i.sequencial,
    nomeProduto: i.nome,
    unidadeMedida: i.unidadeMedida,
    quantidade: i.quantidade,
    valorReferencia: i.valorUnitario,
    valorTotal: i.valorTotal,
    classificacao: i.classificacao,
    dataDesejada: p && !("anual" in p) ? `${p.ano}-${String(p.mes).padStart(2, "0")}-01` : null,
    codigo: i.unidade,
    municipio: i.origem,
    dfdId: i.dfdId,
    dfdNumero: meta.get(i.dfdId)?.numero ?? null,
    protocoloNumero: meta.get(i.dfdId)?.protocoloNumero ?? null,
    itemNumero: i.itemNumero,
    ano: p?.ano ?? null,
    mes: p && !("anual" in p) ? p.mes : null,
    anual,
  };
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
    return { resumo, porClassificacao, porMes, porUnidadeMedida, top, itens, unidades: us, unidadeId, protocolos: 0, dfds: 0, dfdsLista: [], protocolosLista: [] };
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
    .map((i) => itemRowConsolidado(i, c.meta));
  // DFDs vigentes (dos itens ATIVOS, no filtro de unidade) — a visão "DFDs" da consulta.
  const porDfd = new Map<number, DfdDoPca>();
  for (const i of lista) {
    const m = c.meta.get(i.dfdId);
    const d =
      porDfd.get(i.dfdId) ??
      ({
        id: i.dfdId,
        protocoloId: m?.protocoloId ?? null,
        numero: m?.numero ?? String(i.dfdId),
        planejamento: m?.planejamento ?? null,
        tipo: m?.tipo ?? null,
        sigla: m?.sigla ?? null,
        protocoloNumero: m?.protocoloNumero ?? null,
        itens: 0,
        valor: 0,
      } satisfies DfdDoPca);
    d.itens += 1;
    d.valor += i.valorTotal;
    porDfd.set(i.dfdId, d);
  }
  const dfdsLista = [...porDfd.values()].sort((a, b) => a.numero.localeCompare(b.numero, "pt-BR", { numeric: true }));
  // Protocolos incorporados (agregado dos DFDs vigentes) — a visão "Protocolos" da consulta.
  const porProto = new Map<number, ProtocoloDoPca>();
  for (const d of dfdsLista) {
    if (d.protocoloId == null) continue;
    const m = c.meta.get(d.id);
    const pr = porProto.get(d.protocoloId) ?? { id: d.protocoloId, numero: m?.protocoloNumero ?? String(d.protocoloId), assunto: m?.protocoloAssunto ?? null, sigla: m?.protocoloSigla ?? null, dfds: 0, itens: 0, valor: 0 };
    pr.dfds += 1;
    pr.itens += d.itens;
    pr.valor += d.valor;
    porProto.set(d.protocoloId, pr);
  }
  return {
    ...ag,
    itens,
    dfdsLista,
    protocolosLista: [...porProto.values()].sort((a, b) => a.numero.localeCompare(b.numero, "pt-BR", { numeric: true })),
    unidades: [...reps].map(([id, sigla]) => ({ id, codigo: sigla, municipio: "" })).sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR")),
    unidadeId,
    protocolos: c.protocolos,
    dfds: new Set(lista.map((i) => i.dfdId)).size,
  };
}

// ---------------------------------------------------------------------------
// CONSULTA PÚBLICA (banners do Dashboard — tela inicial e painel): só o que está INCORPORADO ao PCA, HIGIENIZADO
// (`pca-publico-core.ts`). PCA em Preview só para quem está logado.
// ---------------------------------------------------------------------------

/** Protocolo da consulta: a capa (sem CPF/CNPJ) + os DFDs dele que contam no PCA. */
export type ProtocoloConsulta = {
  id: number;
  numero: string;
  idExterno: string | null;
  data: string | null;
  interessado: string | null;
  assunto: string | null;
  observacao: string | null;
  valorCapa: number | null;
  localReparticao: string | null;
  anoPca: number | null;
  unidade: string | null;
  dfds: DfdDoPca[];
};

async function pcaConsultavel(pcaId: number, logado: boolean): Promise<PcaEspaco | null> {
  const pca = await getPcaEspaco(pcaId);
  return pca && pca.fonte === "protocolo" && (logado || pca.status === "publicado") ? pca : null;
}

/** Protocolos INCORPORADOS ao PCA. */
async function incorporadosDoPca(pcaId: number): Promise<Set<number>> {
  const rows = await getDb()
    .select({ id: dfdProtocolos.id })
    .from(dfdProtocolos)
    .where(and(eq(dfdProtocolos.pcaId, pcaId), isNotNull(dfdProtocolos.pcaIncorporadoEm)));
  return new Set(rows.map((r) => r.id));
}

/** O DFD está no PCA (vínculo) por um protocolo INCORPORADO? */
async function dfdNoPca(pcaId: number, dfdId: number, incorporados: Set<number>): Promise<boolean> {
  const [v] = await getDb()
    .select({ protocoloId: dfds.protocoloId })
    .from(pcaDfds)
    .innerJoin(dfds, eq(pcaDfds.dfdId, dfds.id))
    .where(and(eq(pcaDfds.pcaId, pcaId), eq(pcaDfds.dfdId, dfdId)))
    .limit(1);
  return !!v && v.protocoloId != null && incorporados.has(v.protocoloId);
}

/** DFD da consulta (itens ATIVOS no PCA; o solicitante pela conferência com os responsáveis da unidade). */
export async function consultaDfd(pcaId: number, dfdId: number, logado: boolean): Promise<DfdConsulta | null> {
  if (!(await pcaConsultavel(pcaId, logado))) return null;
  const incorporados = await incorporadosDoPca(pcaId);
  if (!(await dfdNoPca(pcaId, dfdId, incorporados))) return null;
  const [d, inativos] = await Promise.all([
    getDfd(dfdId),
    getDb()
      .select({ id: pcaItens.dfdItemId })
      .from(pcaItens)
      .where(and(eq(pcaItens.pcaId, pcaId), eq(pcaItens.dfdId, dfdId), eq(pcaItens.ativo, false))),
  ]);
  if (!d) return null;
  const fora = new Set(inativos.map((r) => r.id));
  const responsaveis = await carregarResponsaveis(d.reparticaoId);
  const solicitante = solicitanteDeResultado(validarAssinatura(d.assinaturas, responsaveis, { exigeAssinatura: false }));
  return dfdPublico(d, solicitante, (id) => !fora.has(id));
}

/** Protocolo da consulta (só INCORPORADO a este PCA). */
export async function consultaProtocolo(pcaId: number, protocoloId: number, logado: boolean): Promise<ProtocoloConsulta | null> {
  if (!(await pcaConsultavel(pcaId, logado))) return null;
  const p = await getProtocolo(protocoloId);
  if (!p || p.pcaId !== pcaId || !p.pcaIncorporadoEm) return null;
  const [vinc, inativos] = await Promise.all([
    getDb().select({ dfdId: pcaDfds.dfdId }).from(pcaDfds).where(eq(pcaDfds.pcaId, pcaId)),
    inativosPorDfd(),
  ]);
  const noPca = new Set(vinc.map((v) => v.dfdId));
  return {
    id: p.id,
    numero: p.numero,
    idExterno: p.idExterno,
    data: p.data,
    interessado: mascararTexto(p.interessado),
    assunto: p.assunto,
    observacao: mascararTexto(p.observacao),
    valorCapa: p.valorCapa,
    localReparticao: p.localReparticao,
    anoPca: p.anoPca,
    unidade: p.reparticaoCodigo ? `${p.reparticaoCodigo}${p.reparticaoNome ? ` · ${p.reparticaoNome}` : ""}` : null,
    dfds: p.dfds
      .filter((d) => noPca.has(d.id))
      .map((d) => {
        const fora = inativos.get(`${pcaId}:${d.id}`) ?? { n: 0, valor: 0 };
        return {
          id: d.id,
          protocoloId: p.id,
          numero: d.numero,
          planejamento: d.planejamento,
          tipo: d.tipo,
          sigla: d.reparticaoCodigo,
          protocoloNumero: p.numero,
          itens: (d.totalItens ?? 0) - fora.n,
          valor: (d.valorTotal ?? 0) - fora.valor,
        };
      }),
  };
}

/** Histórico PÚBLICO de um DFD ou protocolo do PCA — só o que passou por protocolos INCORPORADOS, sem o autor. */
export async function consultaHistorico(
  pcaId: number,
  alvo: { dfd: number } | { protocolo: number },
  logado: boolean,
): Promise<LinhaHistorico[] | null> {
  if (!(await pcaConsultavel(pcaId, logado))) return null;
  const incorporados = await incorporadosDoPca(pcaId);
  if ("dfd" in alvo) {
    if (!(await dfdNoPca(pcaId, alvo.dfd, incorporados))) return null;
    return historicoPublico(await historicoDfd(alvo.dfd), incorporados);
  }
  if (!incorporados.has(alvo.protocolo)) return null;
  return historicoPublico(await historicoProtocolo(alvo.protocolo), incorporados);
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

export type LancamentoOrcamentoPca = {
  id: number;
  orgao: string | null;
  unidade: string | null;
  nomeElemento: string | null;
  codigoElemento: string | null;
  unidadeId: number | null;
  valor: number;
};
export type PlanejadoOrcamentoPca = {
  unidadeId: number | null;
  itens: number;
  valor: number;
  item?: ItemRow;
  planilha?: { id: number; codigo: string; nome: string | null };
};

export type OrcamentoDoPca = {
  orcamento: { id: number; nome: string; ano: number } | null;
  visao: VisaoOrcamento | null;
  bruto: number;
  filtrado: number;
  /** Lançamentos filtrados (com a ORIGEM no CUBO) e a unidade do sistema (vínculo) — base do comparativo. */
  linhas: LancamentoOrcamentoPca[];
  /** Planejado do PCA POR ORIGEM: um por item (fonte protocolo) ou por planilha (fonte lista). */
  planejado: PlanejadoOrcamentoPca[];
  unidades: { id: number; sigla: string; nome: string }[];
};

/** Orçamento (CUBO do MESMO ano) filtrado pela visão do PCA + o planejado por unidade. */
/** O orçamento do ANO (o importado por último) — o que o PCA daquele ano usa. Sem ano/sem orçamento ⇒ `null`. */
export async function orcamentoDoAno(ano: number | null): Promise<{ id: number; nome: string; ano: number } | null> {
  if (ano == null) return null;
  const [orc] = await getDb()
    .select({ id: orcamentos.id, nome: orcamentos.nome, ano: orcamentos.ano })
    .from(orcamentos)
    .where(eq(orcamentos.ano, ano))
    .orderBy(desc(orcamentos.id))
    .limit(1);
  return orc ?? null;
}

/** `orcDoAno` = o orçamento do ano já buscado (`orcamentoDoAno`) — evita consultá-lo de novo. */
export async function orcamentoDoPca(pca: PcaEspaco, orcDoAno?: Awaited<ReturnType<typeof orcamentoDoAno>>): Promise<OrcamentoDoPca> {
  const db = getDb();
  const orc = orcDoAno !== undefined ? orcDoAno : await orcamentoDoAno(pca.ano);
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
      // Todas as DIMENSÕES da visão (inclui Função/Programa/Ação/Ficha/Fonte do CUBO novo) — senão o filtro não casa.
      .select({
        id: orcamentoItens.id,
        orgao: orcamentoItens.orgao,
        unidade: orcamentoItens.unidade,
        funcao: orcamentoItens.funcao,
        programa: orcamentoItens.programa,
        acao: orcamentoItens.acao,
        nomeElemento: orcamentoItens.nomeElemento,
        codigoElemento: orcamentoItens.codigoElemento,
        ficha: orcamentoItens.ficha,
        fonte: orcamentoItens.fonte,
        valor: orcamentoItens.valorInicial,
      })
      .from(orcamentoItens)
      .where(eq(orcamentoItens.orcamentoId, orc.id));
    bruto = itens.reduce((s, i) => s + Number(i.valor ?? 0), 0);
    const f = aplicarVisao(itens, visao?.filtros);
    filtrado = f.reduce((s, i) => s + Number(i.valor ?? 0), 0);
    const mapa = mapaVinculos(vincs);
    linhas = f.map((i) => ({
      id: i.id,
      orgao: i.orgao,
      unidade: i.unidade,
      nomeElemento: i.nomeElemento,
      codigoElemento: i.codigoElemento,
      unidadeId: alvoDoTexto(mapa, "unidade", i.unidade),
      valor: Number(i.valor ?? 0),
    }));
  }

  // Planejado POR ORIGEM (o comparativo soma por unidade; o detalhe da linha lista a origem).
  let planejado: PlanejadoOrcamentoPca[];
  if (pca.fonte === "lista") {
    const porSigla = new Map(reps.map((r) => [r.sigla.trim().toUpperCase(), r.id]));
    planejado = (await getUnidades(undefined, pca.id)).map((u) => ({
      unidadeId: u.reparticaoId ?? porSigla.get(u.codigo.trim().toUpperCase()) ?? null,
      itens: Number(u.totalItens ?? 0),
      valor: Number(u.valorTotal ?? 0),
      planilha: { id: u.id, codigo: u.codigo, nome: u.municipio ?? u.nomeArquivo },
    }));
  } else {
    const c = await itensConsolidados(pca);
    planejado = c.itens.map((i) => ({ unidadeId: i.reparticaoId, itens: 1, valor: i.valorTotal, item: itemRowConsolidado(i, c.meta) }));
  }
  return { orcamento: orc, visao, bruto, filtrado, linhas, planejado, unidades: reps };
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

/**
 * O CRONOGRAMA DE CONTRATAÇÕES para o Calendário (migração `0047`): dos PCAs de fonte protocolo cujo ANO cruza `de`–`ate`,
 * os DFDs VIGENTES (consolidados — o mesmo critério do Dashboard) com a PREVISÃO DE ENTREGA (seção 5; `previsaoDoDfd`).
 * Sem previsão, o DFD fica de fora. Falha = lista vazia (o calendário segue sem o PCA).
 */
export async function cronogramaPcas(de: string, ate: string): Promise<{ pcas: { id: number; nome: string; ano: number }[]; dfds: DfdPrevisao[] }> {
  try {
    const db = getDb();
    const a0 = Number(de.slice(0, 4));
    const a1 = Number(ate.slice(0, 4));
    const lista = (await db.select({ id: pcas.id, nome: pcas.nome, ano: pcas.ano, fonte: pcas.fonte }).from(pcas)).filter(
      (p): p is typeof p & { ano: number } => coerceFonte(p.fonte) === "protocolo" && p.ano != null && p.ano >= a0 && p.ano <= a1,
    );
    if (!lista.length) return { pcas: [], dfds: [] };
    const vs = await vinculos(lista.map((p) => p.id));
    const out: DfdPrevisao[] = [];
    for (const p of lista) {
      const vig = consolidarPca(vs.filter((v) => v.pcaId === p.id)).vigentes;
      for (const lote of lotesDeIds(vig)) {
        const ds = await db
          .select({ id: dfds.id, numero: dfds.numero, planejamento: dfds.planejamento, objeto: dfds.objeto, secoes: dfds.secoes, anoPca: dfds.anoPca, valor: dfds.valorTotal, sigla: reparticoes.codigo })
          .from(dfds)
          .leftJoin(reparticoes, eq(dfds.reparticaoId, reparticoes.id))
          .where(inArray(dfds.id, lote));
        for (const d of ds) {
          let secoes: { titulo?: string | null; texto?: string | null }[] = [];
          try {
            secoes = d.secoes ? JSON.parse(d.secoes) : [];
          } catch {
            secoes = [];
          }
          const pv = previsaoDoDfd(secoes, d.anoPca ?? p.ano);
          if (!pv) continue;
          out.push({
            pcaId: p.id,
            pcaNome: p.nome,
            dfdId: d.id,
            numero: d.numero,
            planejamento: d.planejamento,
            objeto: d.objeto,
            sigla: d.sigla,
            valor: Number(d.valor ?? 0),
            ano: pv.ano,
            mes: "mes" in pv ? pv.mes : null,
            anual: "anual" in pv,
          });
        }
      }
    }
    return { pcas: lista.map((p) => ({ id: p.id, nome: p.nome, ano: p.ano })), dfds: out };
  } catch (e) {
    console.error("cronograma do PCA falhou", e);
    return { pcas: [], dfds: [] };
  }
}
