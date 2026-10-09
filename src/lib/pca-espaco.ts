import { itensParaTexto } from "./itens-dash-texto";
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import {
  dfdItens,
  dfdProtocolos,
  dfds,
  orcamentoItens,
  orcamentos,
  orcamentoVinculos,
  orcamentoVisoes,
  orgaos,
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
import { prioridadeDoDfd } from "./dfd-tratamento";
import { normUnidadeMedida } from "./normalize";
import { type RelatorioOrcamento, relatorioOrcamentoPca } from "./orcamento-relatorio";
import { type AusentesVisao, aplicarVisao, coerceFiltros, type FiltrosVisao, type VisaoOrcamento, valoresAusentes } from "./orcamento-visao";
import { comVinculos, lerProprias, mapaVinculos, unidadeDoLancamento, vinculosDaVisao } from "./orcamento-vinculo";
import { listarVinculosOrcamento } from "./orcamento";
import { tipoCurtoDfd } from "./parse-dfd-comum";
import {
  type AcaoDfdPca,
  acaoSugerida,
  agregarDashboard,
  coerceAcao,
  coerceFonte,
  coerceStatus,
  consolidarPca,
  foraDaSoma,
  type FontePca,
  type ItemDashboard,
  type LinhaVinculo,
  previaAtiva,
  previsaoDoDfd,
  type StatusPca,
} from "./pca-core";
import { filtroAnoPcaDfd } from "./dfd-sql";
import { consultaDfdsEmOutroPca } from "./pca-dfds-sql";
import {
  baixarNumeros,
  desvincularProtocoloDoPca,
  gravarSequencialNosItens,
  numerarItensDoProtocolo,
  retratarNumeros,
} from "./pca-itens-sql";
import { MOTIVO_NUMERO } from "./pca-numeracao-core";
import { sincronizarAtivosPca } from "./pca-sincronia";
import { type DfdConsulta, dfdPublico, historicoPublico, mascararTexto } from "./pca-publico-core";
import { getProtocolo } from "./protocolo";
import type { Fatia, ItemRow, PontoMensal, Resumo, TopItem } from "./queries";
import { getItensTodos, getPorClassificacao, getPorMes, getPorUnidadeMedida, getResumo, getTopItens, getUnidades } from "./queries";
import { solicitanteDeResultado, validarAssinatura } from "./reparticao-responsaveis";
import { carregarResponsaveis, lotesDeIds } from "./reparticoes";
import { memoPorVersao } from "./versao-dados";

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
  /** A Mesa do PCA mostra também os protocolos MARCADOS com o ano dele que ainda estão na Mesa do sistema (visão). */
  mesaMarcados: boolean;
};

export type PcaCard = PcaEspaco & {
  total: number;
  itens: number;
  /** Planilhas (lista) ou protocolos (protocolo) no PCA. */
  partes: number;
  dfds: number;
  /** PRÉVIA ligada (`previaAtiva`): os totais incluem os DFDs ainda não incorporados. */
  previa: boolean;
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
  mesaMarcados: pcas.mesaMarcados,
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
    mesaMarcados: !!r.mesaMarcados,
  };
}

/** O ANO dos marcados que a Mesa do PCA também mostra (a visão ligada na Configuração e o PCA com ano), ou `null`. */
export async function anoMarcadosDoPca(id: number): Promise<number | null> {
  const [r] = await getDb()
    .select({ ano: pcas.ano, mesaMarcados: pcas.mesaMarcados, fonte: pcas.fonte, status: pcas.status })
    .from(pcas)
    .where(eq(pcas.id, id))
    .limit(1);
  return r && previaAtiva({ mesaMarcados: !!r.mesaMarcados, status: coerceStatus(r.status), fonte: coerceFonte(r.fonte), ano: r.ano }) ? r.ano : null;
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
  /** Nº do DFD e do protocolo de origem (o "fora da soma" do Dashboard). */
  numero: string;
  protocoloNumero: string | null;
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
      numero: dfds.numero,
      protocoloNumero: dfdProtocolos.numero,
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
    numero: r.numero,
    protocoloNumero: r.protocoloNumero,
  }));
}

export async function vinculosDoPca(pcaId: number): Promise<VinculoDfd[]> {
  return vinculos([pcaId]);
}

/**
 * Os vínculos da PRÉVIA (`previaAtiva`): os DFDs que AINDA NÃO estão em nenhum PCA dos protocolos ENVIADOS a este PCA e não
 * incorporados + dos MARCADOS com o ano dele ainda na Mesa do sistema — como se fossem incorporados agora, com a ação que a
 * incorporação sugeriria (`acaoSugerida` pelo assunto) e DEPOIS dos vínculos reais na ordem (a consolidação é a MESMA,
 * `consolidarPca`). Só leitura: nada é gravado, a numeração dos itens não muda. Sem prévia = `[]` (nenhuma consulta).
 */
async function vinculosPrevia(pca: PcaEspaco): Promise<VinculoDfd[]> {
  if (!previaAtiva(pca) || pca.ano == null) return [];
  const rows = await getDb()
    .select({
      dfdId: dfds.id,
      planejamento: dfds.planejamento,
      valorTotal: dfds.valorTotal,
      totalItens: dfds.totalItens,
      reparticaoId: dfds.reparticaoId,
      protocoloId: dfds.protocoloId,
      assunto: dfdProtocolos.assunto,
      protocoladoEm: dfdProtocolos.criadoEm,
      numero: dfds.numero,
      protocoloNumero: dfdProtocolos.numero,
    })
    .from(dfds)
    .innerJoin(dfdProtocolos, eq(dfds.protocoloId, dfdProtocolos.id))
    .where(
      and(
        or(
          and(eq(dfdProtocolos.pcaId, pca.id), isNull(dfdProtocolos.pcaIncorporadoEm)),
          and(isNull(dfdProtocolos.pcaId), filtroAnoPcaDfd(pca.ano)),
        ),
        sql`NOT EXISTS (SELECT 1 FROM ${pcaDfds} WHERE ${pcaDfds.dfdId} = ${dfds.id})`,
      ),
    );
  return rows.map((r) => ({
    pcaId: pca.id,
    dfdId: r.dfdId,
    acao: acaoSugerida(r.assunto),
    planejamento: r.planejamento,
    // "~" ordena depois de qualquer data de vínculo: a prévia entra por último, sobre o que já foi incorporado.
    ordem: `${r.protocoladoEm ?? ""}|~`,
    protocoloId: r.protocoloId,
    valorTotal: Number(r.valorTotal ?? 0),
    totalItens: Number(r.totalItens ?? 0),
    reparticaoId: r.reparticaoId,
    numero: r.numero,
    protocoloNumero: r.protocoloNumero,
  }));
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
export function listarPcasCards(): Promise<PcaCard[]> {
  return memoPorVersao("pcas-cards", calcularPcasCards);
}

async function calcularPcasCards(): Promise<PcaCard[]> {
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
  // A PRÉVIA (só PCAs em Preview com a visão dos marcados ligada — poucos): os vínculos ainda não incorporados entram depois.
  const previas = await Promise.all(rows.map(paraEspaco).filter(previaAtiva).map(vinculosPrevia));
  for (const v of [...todos, ...previas.flat()]) {
    const l = porPca.get(v.pcaId);
    if (l) l.push(v);
    else porPca.set(v.pcaId, [v]);
  }
  return rows.map((r) => {
    const p = paraEspaco(r);
    if (p.fonte === "lista") {
      const s = plan.get(p.id);
      return { ...p, total: Number(s?.total ?? 0), itens: Number(s?.itens ?? 0), partes: Number(s?.n ?? 0), dfds: 0, previa: false };
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
      previa: previaAtiva(p),
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
  mesaMarcados: boolean;
}>;

export async function atualizarPcaEspaco(id: number, c: CamposPcaEspaco): Promise<void> {
  const set: Record<string, unknown> = { atualizadoEm: sql`(CURRENT_TIMESTAMP)` };
  for (const k of ["nome", "ano", "fonte", "capa", "orcamentoVisaoId", "mesaMarcados"] as const) if (c[k] !== undefined) set[k] = c[k];
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
  if (dfdIds.length === 0) return m;
  // UMA consulta para todos (os ids num parâmetro JSON) — antes, uma a cada 90 ids.
  for (const r of await consultaDfdsEmOutroPca(getDb(), dfdIds, pcaId)) m.set(r.dfdId, r.pcaId);
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

/**
 * DEVOLVE o protocolo à Mesa principal — o ENVIADO e também o INCORPORADO (desincorpora): os DFDs dele saem do PCA (os
 * vínculos e os nºs dos itens — BAIXADOS, nunca reaproveitados; incorporar de novo dá nºs novos), num lote atômico.
 */
export async function devolverProtocolo(pcaId: number, protocoloId: number, usuarioId: number | null): Promise<void> {
  const db = getDb();
  const volta = db
    .update(dfdProtocolos)
    .set({ pcaId: null, pcaEnviadoEm: null, pcaEnviadoPor: null, pcaIncorporadoEm: null })
    .where(and(eq(dfdProtocolos.id, protocoloId), eq(dfdProtocolos.pcaId, pcaId)));
  await db.batch([
    retratarNumeros(db, { protocoloId }),
    ...baixarNumeros(db, { protocoloId }, pcaId, MOTIVO_NUMERO.protocoloDevolvido, usuarioId),
    desvincularProtocoloDoPca(db, protocoloId, pcaId),
    volta,
  ]);
  await sincronizarAtivosPca(pcaId, usuarioId);
}

/**
 * INCORPORA o protocolo ao PCA (PERMANENTE) num lote ATÔMICO: vincula os DFDs dele (`pca_dfds`, com a ação de cada
 * um, pelo protocolo — `pca_dfds.protocolo_id`), NUMERA os itens com o sequencial único do PCA (`pca_itens` + o próprio
 * item — `pca-itens-sql.ts`) e marca a incorporação. O incorporado segue EDITÁVEL: o PCA acompanha (`pca-sincronia.ts`).
 * Depois, inativa os números dos DFDs que deixaram de ser vigentes.
 */
export async function incorporarProtocolo(
  pcaId: number,
  protocoloId: number,
  entradas: { dfdId: number; acao: AcaoDfdPca }[],
  usuarioId: number | null,
): Promise<void> {
  const db = getDb();
  // 5 parâmetros por linha (+ o protocolo, um só) → 18 linhas por statement (91 < 100 do D1).
  const stmts = [];
  for (let i = 0; i < entradas.length; i += 18) {
    stmts.push(
      db
        .insert(pcaDfds)
        .values(
          entradas
            .slice(i, i + 18)
            .map((e) => ({ pcaId, dfdId: e.dfdId, acao: e.acao, vinculadoPor: usuarioId, vinculadoEm: sql`(CURRENT_TIMESTAMP)`, protocoloId })),
        )
        .onConflictDoUpdate({ target: [pcaDfds.pcaId, pcaDfds.dfdId], set: { acao: sql`excluded.acao`, protocoloId } }),
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

/** Itens numerados do PCA entre os `dfd_itens.id` dados — com a unidade do DFD (escopo) e o estado do número. */
export async function itensNumeradosDoPca(
  pcaId: number,
  dfdItemIds: number[],
): Promise<{ dfdItemId: number; dfdId: number | null; sequencial: number; ativo: boolean; reparticaoId: number | null; dfdNumero: string | null }[]> {
  const out: { dfdItemId: number; dfdId: number | null; sequencial: number; ativo: boolean; reparticaoId: number | null; dfdNumero: string | null }[] = [];
  for (const lote of lotesDeIds(dfdItemIds)) {
    const rows = await getDb()
      .select({ dfdItemId: pcaItens.dfdItemId, dfdId: pcaItens.dfdId, sequencial: pcaItens.sequencial, ativo: pcaItens.ativo, reparticaoId: dfds.reparticaoId, dfdNumero: dfds.numero })
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
      .set({ ativo: false, inativadoEm: sql`(CURRENT_TIMESTAMP)`, inativadoPor: usuarioId, motivo: MOTIVO_NUMERO.retirado })
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
  /** TODOS os itens num texto COMPACTO (`itensParaTexto`) — montado UMA vez por versão dos dados, dentro do memo. */
  itensTexto: string;
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
  /** PRÉVIA ligada (`previaAtiva`): os DFDs/protocolos ainda NÃO incorporados que entraram nos números; `null` = só o incorporado. */
  previa: { dfds: number; protocolos: number } | null;
  /** DFDs vinculados (e da prévia) que a consolidação deixou FORA da soma, com o motivo (só fonte protocolo). */
  foraDaSoma: DfdForaDaSoma[];
};

/** Um DFD fora da soma do PCA — a consolidação por nº de planejamento (`foraDaSoma`, `pca-core.ts`). */
export type DfdForaDaSoma = {
  id: number;
  protocoloId: number | null;
  numero: string;
  planejamento: string | null;
  protocoloNumero: string | null;
  itens: number;
  valor: number;
  /** O motivo por extenso, com o DFD que ficou/retirou. */
  motivo: string;
  /** Ainda não incorporado (entrou pela prévia). */
  previa: boolean;
};

const vazioDash = (): DashboardPca => ({
  resumo: { total: 0, count: 0, ticket: 0, maiorNome: null, maiorValor: 0, numUnidades: 0 },
  porClassificacao: [],
  porMes: [],
  porUnidadeMedida: [],
  top: [],
  itensTexto: itensParaTexto([]),
  unidades: [],
  protocolos: 0,
  dfds: 0,
  dfdsLista: [],
  protocolosLista: [],
  previa: null,
  foraDaSoma: [],
});

/**
 * Itens VIGENTES (consolidados) de um PCA de fonte protocolo, achatados p/ o dashboard: só os itens ATIVOS
 * (retirado do PCA = fora) e com o SEQUENCIAL do PCA (o item legado sem número usa o dele no DFD).
 */
export async function itensConsolidados(pca: PcaEspaco) {
  const db = getDb();
  const [reais, previa, numeros] = await Promise.all([
    vinculosDoPca(pca.id),
    vinculosPrevia(pca),
    db.select({ dfdItemId: pcaItens.dfdItemId, sequencial: pcaItens.sequencial, ativo: pcaItens.ativo }).from(pcaItens).where(eq(pcaItens.pcaId, pca.id)),
  ]);
  // Com a PRÉVIA, os DFDs ainda não incorporados entram depois dos reais (a MESMA consolidação); sem ela, `previa` = [].
  const vs = [...reais, ...previa];
  const cons = consolidarPca(vs);
  const numero = new Map(numeros.filter((n) => n.dfdItemId != null).map((n) => [n.dfdItemId as number, n]));
  const meta = new Map<
    number,
    {
      numero: string;
      planejamento: string | null;
      tipo: string | null;
      secoes: string | null;
      reparticaoId: number | null;
      sigla: string | null;
      protocoloId: number | null;
      protocoloNumero: string | null;
      protocoloAssunto: string | null;
      protocoloSigla: string | null;
    }
  >();
  const itens: (ItemDashboard & { dfdId: number; reparticaoId: number | null; itemNumero: number | null })[] = [];
  // Os lotes em PARALELO (cada um: os DFDs + os itens com SÓ as colunas usadas); a PREVISÃO sai UMA vez por DFD (o JSON
  // das seções pode ser grande — lido por item, milhares de itens estouravam a CPU do Worker).
  const previsaoPorDfd = new Map<number, ReturnType<typeof previsaoDoDfd>>();
  const prioridadePorDfd = new Map<number, string | null>();
  const lotes = await Promise.all(
    lotesDeIds(cons.vigentes).map((lote) =>
      Promise.all([
      db
        .select({
          id: dfds.id,
          numero: dfds.numero,
          planejamento: dfds.planejamento,
          tipo: dfds.tipo,
          secoes: dfds.secoes,
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
      db
        .select({
          id: dfdItens.id,
          dfdId: dfdItens.dfdId,
          item: dfdItens.item,
          sequencial: dfdItens.sequencial,
          codigo: dfdItens.codigo,
          descricao: dfdItens.descricao,
          unidade: dfdItens.unidade,
          quantidade: dfdItens.quantidade,
          valorUnitario: dfdItens.valorUnitario,
          valorTotal: dfdItens.valorTotal,
        })
        .from(dfdItens)
        .where(inArray(dfdItens.dfdId, lote))
        .orderBy(asc(dfdItens.dfdId), asc(dfdItens.sequencial)),
      ]),
    ),
  );
  for (const [ds] of lotes)
    for (const d of ds) {
      meta.set(d.id, d);
      let secoes: { titulo?: string; texto?: string }[] = [];
      try {
        secoes = d.secoes ? (JSON.parse(d.secoes) as typeof secoes) : [];
      } catch {
        secoes = [];
      }
      // O ano da previsão é SEMPRE o do PCA em que o item está (nunca o do texto, de um contrato…).
      previsaoPorDfd.set(d.id, previsaoDoDfd(secoes, pca.ano));
      prioridadePorDfd.set(d.id, prioridadeDoDfd(secoes.map((x) => ({ numero: 0, titulo: x.titulo ?? "", texto: x.texto ?? "" }))));
    }
  for (const [, its] of lotes)
    for (const it of its) {
      const n = numero.get(it.id);
      if (n && !n.ativo) continue; // retirado do PCA
      const d = meta.get(it.dfdId);
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
        previsao: previsaoPorDfd.get(it.dfdId) ?? previsaoDoDfd([], pca.ano),
        unidade: d?.sigla ?? null,
        origem: d ? `DFD ${d.numero}` : null,
      });
    }
  const protocolos = new Set(vs.map((v) => v.protocoloId).filter((x): x is number => x != null));
  // Na PRÉVIA: quantos DFDs/protocolos ainda não incorporados entraram (o aviso do Dashboard/Orçamento).
  const vigentes = new Set(cons.vigentes);
  const previaVig = previa.filter((v) => vigentes.has(v.dfdId));
  return {
    itens,
    meta,
    vinculos: vs,
    consolidacao: cons,
    previaIds: new Set(previa.map((v) => v.dfdId)),
    prioridadePorDfd,
    protocolos: protocolos.size,
    previa: previa.length ? { dfds: previaVig.length, protocolos: new Set(previaVig.map((v) => v.protocoloId)).size } : null,
  };
}

type Consolidados = Awaited<ReturnType<typeof itensConsolidados>>;

/** Item consolidado → a linha da tabela de itens (Dashboard e origem do Orçamento), com a ORIGEM (protocolo/DFD/mês). */
function itemRowConsolidado(i: Consolidados["itens"][number], meta: Consolidados["meta"], prioridades?: Map<number, string | null>): ItemRow {
  const p = i.previsao;
  const anual = !!p && "anual" in p;
  const periodo = p && "anual" in p ? p.periodo : null;
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
    ...(periodo ? { periodo } : {}),
    prioridade: prioridades?.get(i.dfdId) ?? null,
  };
}

/** Dados do dashboard do PCA — o MESMO no painel e na tela inicial. */
export function dashboardDoPca(pca: PcaEspaco, unidadeIdPedida?: number): Promise<DashboardPca> {
  return memoPorVersao(`dash:${chavePca(pca)}:${unidadeIdPedida ?? ""}`, () => calcularDashboardDoPca(pca, unidadeIdPedida));
}

/** O que do PCA muda as cargas dele (a chave do `memoPorVersao`). */
const chavePca = (p: PcaEspaco) => `${p.id}:${p.ano ?? ""}:${p.fonte}:${p.status}:${p.mesaMarcados ? 1 : 0}:${p.orcamentoVisaoId ?? ""}`;

async function calcularDashboardDoPca(pca: PcaEspaco, unidadeIdPedida?: number): Promise<DashboardPca> {
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
      getItensTodos(unidadeId, undefined, pca.id),
    ]);
    return { resumo, porClassificacao, porMes, porUnidadeMedida, top, itensTexto: itensParaTexto(itens), unidades: us, unidadeId, protocolos: 0, dfds: 0, dfdsLista: [], protocolosLista: [], previa: null, foraDaSoma: [] };
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
    .map((i) => itemRowConsolidado(i, c.meta, c.prioridadePorDfd));
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
    itensTexto: itensParaTexto(itens),
    dfdsLista,
    protocolosLista: [...porProto.values()].sort((a, b) => a.numero.localeCompare(b.numero, "pt-BR", { numeric: true })),
    unidades: [...reps].map(([id, sigla]) => ({ id, codigo: sigla, municipio: "" })).sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR")),
    unidadeId,
    protocolos: c.protocolos,
    dfds: new Set(lista.map((i) => i.dfdId)).size,
    previa: c.previa,
    foraDaSoma: dfdsForaDaSoma(c, unidadeId),
  };
}

/** Os DFDs fora da soma (no filtro de unidade), com o motivo por extenso — os mais recentes primeiro. */
function dfdsForaDaSoma(c: Consolidados, unidadeId: number | undefined): DfdForaDaSoma[] {
  const porId = new Map(c.vinculos.map((v) => [v.dfdId, v]));
  const ref = (id: number | null) => {
    const v = id == null ? null : porId.get(id);
    return v ? `DFD ${v.numero}${v.protocoloNumero ? ` (protocolo ${v.protocoloNumero})` : ""}` : "outro DFD";
  };
  const texto = (f: ReturnType<typeof foraDaSoma>[number]) =>
    f.motivo === "substituido"
      ? `Mesmo nº de planejamento — prevaleceu o ${ref(f.outro)}`
      : f.motivo === "excluido"
        ? `Retirado pela exclusão do ${ref(f.outro)}`
        : f.outro != null
          ? `Exclusão — retirou o ${ref(f.outro)}`
          : "Exclusão sem DFD correspondente no PCA";
  return foraDaSoma(c.vinculos, c.consolidacao)
    .map((f) => ({ f, v: porId.get(f.dfdId) }))
    .filter((x): x is { f: ReturnType<typeof foraDaSoma>[number]; v: VinculoDfd } => !!x.v && (unidadeId == null || x.v.reparticaoId === unidadeId))
    .map(({ f, v }) => ({
      id: v.dfdId,
      protocoloId: v.protocoloId,
      numero: v.numero,
      planejamento: v.planejamento,
      protocoloNumero: v.protocoloNumero,
      itens: v.totalItens,
      valor: v.valorTotal,
      motivo: texto(f),
      previa: c.previaIds.has(v.dfdId),
    }))
    .reverse();
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

/**
 * O que a consulta do PCA pode abrir: os protocolos INCORPORADOS e — com a PRÉVIA ligada (só em Preview, logo só para quem
 * está logado) — também os protocolos/DFDs da prévia (os mesmos que entram nos números do Dashboard/Orçamento).
 */
async function escopoConsulta(pca: PcaEspaco): Promise<{ protocolos: Set<number>; previaDfds: Set<number>; previa: VinculoDfd[] }> {
  const [rows, previa] = await Promise.all([
    getDb()
      .select({ id: dfdProtocolos.id })
      .from(dfdProtocolos)
      .where(and(eq(dfdProtocolos.pcaId, pca.id), isNotNull(dfdProtocolos.pcaIncorporadoEm))),
    vinculosPrevia(pca),
  ]);
  const protocolos = new Set(rows.map((r) => r.id));
  for (const v of previa) if (v.protocoloId != null) protocolos.add(v.protocoloId);
  return { protocolos, previaDfds: new Set(previa.map((v) => v.dfdId)), previa };
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
  const pca = await pcaConsultavel(pcaId, logado);
  if (!pca) return null;
  const esc = await escopoConsulta(pca);
  if (!esc.previaDfds.has(dfdId) && !(await dfdNoPca(pcaId, dfdId, esc.protocolos))) return null;
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
  const pca = await pcaConsultavel(pcaId, logado);
  if (!pca) return null;
  const esc = await escopoConsulta(pca);
  if (!esc.protocolos.has(protocoloId)) return null;
  const [p, vs, inativos] = await Promise.all([getProtocolo(protocoloId), vinculosDoPca(pcaId), inativosPorDfd()]);
  if (!p) return null;
  // Só os DFDs que CONTAM no PCA — os VIGENTES (a MESMA consolidação do Dashboard e dos cards: um "excluir" ou um DFD
  // substituído não soma) com itens ativos; o valor = os itens ativos (o gravado − os inativos).
  const vigentes = new Set(consolidarPca([...vs, ...esc.previa]).vigentes);
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
      .filter((d) => vigentes.has(d.id))
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
      })
      .filter((d) => d.itens > 0),
  };
}

/** Histórico PÚBLICO de um DFD ou protocolo do PCA — só o que passou por protocolos INCORPORADOS, sem o autor. */
export async function consultaHistorico(
  pcaId: number,
  alvo: { dfd: number } | { protocolo: number },
  logado: boolean,
): Promise<LinhaHistorico[] | null> {
  const pca = await pcaConsultavel(pcaId, logado);
  if (!pca) return null;
  const { protocolos, previaDfds } = await escopoConsulta(pca);
  if ("dfd" in alvo) {
    if (!previaDfds.has(alvo.dfd) && !(await dfdNoPca(pcaId, alvo.dfd, protocolos))) return null;
    return historicoPublico(await historicoDfd(alvo.dfd), protocolos);
  }
  if (!protocolos.has(alvo.protocolo)) return null;
  return historicoPublico(await historicoProtocolo(alvo.protocolo), protocolos);
}

// ---------------------------------------------------------------------------
// Orçamento do PCA
// ---------------------------------------------------------------------------

function paraVisao(r: { id: number; nome: string; filtros: string; ordem: number; vinculosProprios: string }): VisaoOrcamento {
  return { id: r.id, nome: r.nome, ordem: r.ordem, filtros: coerceFiltros(r.filtros), proprias: lerProprias(r.vinculosProprios) };
}

/** As visões salvas + os PCAs que usam cada uma (a visão é GLOBAL — alterar uma muda o orçamento de todos eles). */
export async function listarVisoesOrcamento(): Promise<VisaoOrcamento[]> {
  const db = getDb();
  const [rows, usos] = await Promise.all([
    db.select().from(orcamentoVisoes).orderBy(asc(orcamentoVisoes.ordem), asc(orcamentoVisoes.id)),
    db
      .select({ visao: pcas.orcamentoVisaoId, nome: pcas.nome, ano: pcas.ano })
      .from(pcas)
      .where(isNotNull(pcas.orcamentoVisaoId))
      .orderBy(asc(pcas.nome)),
  ]);
  const porVisao = new Map<number, string[]>();
  for (const u of usos) if (u.visao != null) porVisao.set(u.visao, [...(porVisao.get(u.visao) ?? []), u.ano ? `${u.nome} (${u.ano})` : u.nome]);
  return rows.map((r) => ({ ...paraVisao(r), pcas: porVisao.get(r.id) ?? [] }));
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

/** Exclui a visão e os vínculos PRÓPRIOS dela (também pela FK cascade). */
export async function excluirVisaoOrcamento(id: number): Promise<void> {
  const db = getDb();
  await db.batch([db.delete(orcamentoVinculos).where(eq(orcamentoVinculos.visaoId, id)), db.delete(orcamentoVisoes).where(eq(orcamentoVisoes.id, id))]);
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
  /** As UNIDADES (o micro) com o órgão de cada uma — a linha do comparativo é a unidade; o órgão, a soma delas. */
  unidades: { id: number; sigla: string; nome: string; orgaoId: number | null; orgaoSigla: string | null; oculta: boolean }[];
  orgaos: { id: number; sigla: string; nome: string }[];
  /** PRÉVIA ligada: os DFDs/protocolos ainda NÃO incorporados que entraram no planejado; `null` = só o incorporado. */
  previa: { dfds: number; protocolos: number } | null;
  /** Os valores da visão que o orçamento ATUAL não traz (ex.: depois de reenviar o QDD) — vazio = visão em dia. */
  ausentes: AusentesVisao;
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
  const orc = orcDoAno !== undefined ? orcDoAno : await orcamentoDoAno(pca.ano);
  return memoPorVersao(`orc:${chavePca(pca)}:${orc?.id ?? ""}`, () => calcularOrcamentoDoPca(pca, orc));
}

/** O que o orçamento do PCA lê do banco: a visão, as unidades (com o órgão), os órgãos, os vínculos e os lançamentos do CUBO
 * (todas as dimensões — senão o filtro da visão não casa). A MESMA base do comparativo e do relatório da composição. */
async function baseOrcamentoPca(pca: PcaEspaco, orc: Awaited<ReturnType<typeof orcamentoDoAno>>) {
  const db = getDb();
  const [visao, repsBrutas, orgs, todosVinculos] = await Promise.all([
    pca.orcamentoVisaoId ? getVisaoOrcamento(pca.orcamentoVisaoId) : Promise.resolve(null),
    db
      .select({ id: reparticoes.id, sigla: reparticoes.codigo, nome: reparticoes.nome, orgaoId: reparticoes.orgaoId, oculta: reparticoes.oculto })
      .from(reparticoes)
      .where(ne(sql`UPPER(${reparticoes.codigo})`, "GERAL")),
    db.select({ id: orgaos.id, sigla: orgaos.sigla, nome: orgaos.nome }).from(orgaos),
    listarVinculosOrcamento(),
  ]);
  // Os vínculos que VALEM na visão do PCA (os próprios dela; nas demais unidades, o padrão).
  const vincs = vinculosDaVisao(todosVinculos, visao);
  const orgaoLista = orgs.map((o) => ({ id: o.id, sigla: (o.sigla ?? "").trim() || o.nome, nome: o.nome }));
  const siglaOrgao = new Map(orgaoLista.map((o) => [o.id, o.sigla]));
  const reps = repsBrutas.map((r) => ({
    ...r,
    orgaoSigla: r.orgaoId != null ? (siglaOrgao.get(r.orgaoId) ?? null) : null,
    oculta: r.oculta === true,
  }));
  const itens = orc
    ? await db
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
        .where(eq(orcamentoItens.orcamentoId, orc.id))
    : [];
  return { visao, reps, orgaoLista, vincs, itens };
}

async function calcularOrcamentoDoPca(pca: PcaEspaco, orc: Awaited<ReturnType<typeof orcamentoDoAno>>): Promise<OrcamentoDoPca> {
  const { visao, reps, orgaoLista, vincs, itens } = await baseOrcamentoPca(pca, orc);
  let bruto = 0;
  let filtrado = 0;
  let linhas: OrcamentoDoPca["linhas"] = [];
  let ausentes: AusentesVisao = [];
  if (orc) {
    bruto = itens.reduce((s, i) => s + Number(i.valor ?? 0), 0);
    ausentes = valoresAusentes(itens, visao?.filtros);
    // A visão filtra só o que NÃO é do vínculo (função, programa, elemento, código, ficha, fonte); a unidade de cada
    // lançamento vem SÓ do vínculo pela ação (`unidadeDoLancamento`) — os dois nunca disputam o mesmo lançamento.
    const f = aplicarVisao(comVinculos(itens, vincs, { orgaos: orgaoLista, unidades: reps }), visao?.filtros);
    filtrado = f.reduce((s, i) => s + Number(i.valor ?? 0), 0);
    const mapa = mapaVinculos(vincs);
    linhas = f.map((i) => ({
      id: i.id,
      orgao: i.orgao,
      unidade: i.unidade,
      nomeElemento: i.nomeElemento,
      codigoElemento: i.codigoElemento,
      unidadeId: unidadeDoLancamento(mapa, i.unidade, i.acao),
      valor: Number(i.valor ?? 0),
    }));
  }

  // Planejado POR ORIGEM (o comparativo soma por unidade; o detalhe da linha lista a origem).
  let planejado: PlanejadoOrcamentoPca[];
  let previa: OrcamentoDoPca["previa"] = null;
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
    planejado = c.itens.map((i) => ({ unidadeId: i.reparticaoId, itens: 1, valor: i.valorTotal, item: itemRowConsolidado(i, c.meta, c.prioridadePorDfd) }));
    previa = c.previa;
  }
  return { orcamento: orc, visao, bruto, filtrado, linhas, planejado, unidades: reps, orgaos: orgaoLista, previa, ausentes };
}

/**
 * O RELATÓRIO DA COMPOSIÇÃO do orçamento do PCA (PCA × Orçamento → "Relatório"): a mesma base do comparativo + as
 * contratações por unidade, calculado pelo núcleo puro `relatorioOrcamentoPca`. Sem ano/orçamento ⇒ `null`.
 */
export async function relatorioOrcamentoDoPca(pca: PcaEspaco): Promise<RelatorioOrcamento | null> {
  const orc = await orcamentoDoAno(pca.ano);
  if (!orc) return null;
  const [base, resumo] = await Promise.all([baseOrcamentoPca(pca, orc), orcamentoDoPca(pca, orc)]);
  return relatorioOrcamentoPca({
    pca: { nome: pca.nome, ano: pca.ano },
    orcamento: { nome: orc.nome, ano: orc.ano },
    visao: base.visao ? { nome: base.visao.nome, filtros: base.visao.filtros } : null,
    lancamentos: base.itens.map((i) => ({ ...i, valor: Number(i.valor ?? 0) })),
    vinculos: base.vincs,
    unidades: base.reps.map((r) => ({ id: r.id, sigla: r.sigla, nome: r.nome, orgaoSigla: r.orgaoSigla })),
    planejado: resumo.planejado.map((p) => ({ unidadeId: p.unidadeId, valor: p.valor })),
  });
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
export async function cronogramaPcas(de: string, ate: string, permitidos: Set<number> | null = null): Promise<{ pcas: { id: number; nome: string; ano: number }[]; dfds: DfdPrevisao[] }> {
  try {
    const db = getDb();
    const a0 = Number(de.slice(0, 4));
    const a1 = Number(ate.slice(0, 4));
    const lista = (await db.select({ id: pcas.id, nome: pcas.nome, ano: pcas.ano, fonte: pcas.fonte }).from(pcas)).filter(
      // `permitidos` = os PCAs do grupo da pessoa (null = todos).
      (p): p is typeof p & { ano: number } =>
        coerceFonte(p.fonte) === "protocolo" && p.ano != null && p.ano >= a0 && p.ano <= a1 && (!permitidos || permitidos.has(p.id)),
    );
    if (!lista.length) return { pcas: [], dfds: [] };
    const [vs, inativos] = await Promise.all([vinculos(lista.map((p) => p.id)), inativosPorDfd()]);
    const out: DfdPrevisao[] = [];
    for (const p of lista) {
      const vig = consolidarPca(vs.filter((v) => v.pcaId === p.id)).vigentes;
      for (const lote of lotesDeIds(vig)) {
        const ds = await db
          .select({ id: dfds.id, numero: dfds.numero, planejamento: dfds.planejamento, objeto: dfds.objeto, secoes: dfds.secoes, valor: dfds.valorTotal, sigla: reparticoes.codigo })
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
          const pv = previsaoDoDfd(secoes, p.ano);
          if (!pv) continue;
          out.push({
            pcaId: p.id,
            pcaNome: p.nome,
            dfdId: d.id,
            numero: d.numero,
            planejamento: d.planejamento,
            objeto: d.objeto,
            sigla: d.sigla,
            // O valor que CONTA no PCA: sem os itens retirados (o mesmo do card e do Dashboard).
            valor: Number(d.valor ?? 0) - (inativos.get(`${p.id}:${d.id}`)?.valor ?? 0),
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
