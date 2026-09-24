import { and, asc, desc, eq, gt, inArray, isNull, type SQL, sql } from "drizzle-orm";
import { cache } from "react";
import { dfdItens, dfdProtocolos, dfds, pcaDfds, pcaItens, pcas, reparticoes } from "@/db/schema";
import type { ConferenciaCompacta } from "./catalogo-conferencia";
import { getDb } from "./db";
import { filtroAnoPcaDfd, prioridadeTextoSql } from "./dfd-sql";
import { type GrupoAssinatura, gruposAssinatura, prioridadeDoDfd } from "./dfd-tratamento";
import { normPrioridade, type Prioridade } from "./normalize";
import { limparRastroDestino, retratoRastro } from "./rastro-sql";
import { lotesDeIds } from "./reparticoes";
import type { ItemMassa, PatchItem, PlanoMassaItens } from "./massa-itens";
import type {
  CadastrarPcaPayload,
  DfdItemPayload,
  DfdMetaPayload,
  EditarPcaPayload,
  GerarPcaPayload,
} from "./dfd-validation";
import { type Assinatura, coerceFonte, coerceValidacao, juntarRefs } from "./parse-dfd-comum";

/**
 * Acesso a dados de DFD/PCA. Escopo por REPARTIÇÃO (como as `unidades`): a
 * listagem filtra pela repartição ativa do head (Geral = todas). Edições de PCA
 * são o plano CONSOLIDADO da Prefeitura (globais). Sem `grupo_id`.
 */

// dfd_itens = 9 colunas vinculadas por linha → 11×9 = 99 (< limite de 100 do D1).
const ROWS_PER_STMT = 11;

// biome-ignore lint/suspicious/noExplicitAny: tipos encadeados do query-builder do Drizzle para db.batch() são inviáveis de anotar aqui.
function insertsItens(db: ReturnType<typeof getDb>, dfdId: number | SQL, itens: DfdItemPayload[], seqBase = 0): any[] {
  const stmts = [];
  for (let i = 0; i < itens.length; i += ROWS_PER_STMT) {
    stmts.push(
      db.insert(dfdItens).values(
        itens.slice(i, i + ROWS_PER_STMT).map((it, j) => ({
          dfdId,
          item: it.item ?? null,
          codigo: it.codigo ?? null,
          descricao: it.descricao ?? null,
          unidade: it.unidade ?? null,
          quantidade: it.quantidade ?? null,
          valorUnitario: it.valorUnitario ?? null,
          valorTotal: it.valorTotal ?? null,
          sequencial: seqBase + i + j + 1, // continua a numeração entre lotes
        })),
      ),
    );
  }
  return stmts;
}

export type DfdResumo = {
  id: number;
  numero: string;
  planejamento: string | null;
  tipo: string | null;
  objeto: string | null;
  setorRequisitante: string | null;
  responsavel: string | null;
  valorTotal: number | null;
  totalItens: number | null;
  atualizadoEm: string | null;
  reparticaoId: number | null;
  reparticaoCodigo: string | null;
  reparticaoNome: string | null;
  protocoloId: number | null;
  protocoloNumero: string | null;
  /** Assunto do protocolo de origem — a CATEGORIA (exceções do ADM) da conferência do DFD. */
  protocoloAssunto: string | null;
  /** Ano do PCA do protocolo de origem (o DFD herda; referência p/ DFDs antigos sem o próprio ano). */
  protocoloAnoPca: number | null;
  /** Ano do PCA do PRÓPRIO DFD (na Mesa prevalece o do protocolo — `anoPcaDfdSql`, `dfd-sql.ts`). */
  anoPca: number | null;
  /** Prioridade da seção PRIORIDADE, normalizada (ALTA/MÉDIA/BAIXA; `null` = ausente ou fora do padrão) — coluna da Mesa. */
  prioridade: Prioridade | null;
  /** Responsável do protocolo de origem — o filtro de responsável da Mesa vale também para DFDs/itens. */
  protocoloResponsavelId: number | null;
  /** Mesa do PCA (migração `0034`): o PCA para onde o protocolo de origem foi enviado e quando foi
   * INCORPORADO (≠ null ⇒ o DFD e os itens estão TRAVADOS para edição). */
  protocoloPcaId: number | null;
  protocoloPcaIncorporadoEm: string | null;
  // Referências de renovação (DFD-R) — para sinalizar ATENÇÃO nas listas sem abrir o DFD.
  numeroContrato: string | null;
  numeroAta: string | null;
  numeroLicitacao: string | null;
  // Tipos de assinatura presentes (Centi/Dropsigner/Adobe/Foxit) — coluna "Assinatura" das listas.
  assinaturaGrupos: GrupoAssinatura[];
};

export type DfdItemRow = {
  id: number;
  item: number | null;
  codigo: string | null;
  descricao: string | null;
  unidade: string | null;
  quantidade: number | null;
  valorUnitario: number | null;
  valorTotal: number | null;
};

export type DfdSecaoRow = { numero: number; titulo: string; texto: string };

/** Linha PLANA de item (para a visão "Itens" da tela DFD): o item + de qual DFD/protocolo/unidade veio. */
export type ItemDfdRow = {
  id: number; // dfd_itens.id
  dfdId: number;
  dfdNumero: string;
  /** Nº de planejamento do DFD de origem (o identificador do Centi — `null`/vazio = DFD sem planejamento; `planejamentoDfd`). */
  dfdPlanejamento: string | null;
  sigla: string | null; // código da unidade do DFD
  reparticaoId: number | null; // unidade do DFD (escopo de acesso da Mesa do PCA)
  protocoloNumero: string | null;
  /** Assunto do protocolo de origem — a CATEGORIA das exceções do ADM (ex.: o ponto `item.duplicado`). */
  protocoloAssunto: string | null;
  /** Tipo do DFD de origem (o catálogo restringe tipos por item). */
  dfdTipo: string | null;
  item: number | null;
  codigo: string | null;
  descricao: string | null;
  unidade: string | null;
  quantidade: number | null;
  valorUnitario: number | null;
  valorTotal: number | null;
  /** Nº do item no PCA (só na Mesa do PCA, item INCORPORADO) e se o nº está ativo (retirado = inativo). */
  pcaSequencial: number | null;
  pcaAtivo: boolean | null;
  /** Conformidade com o CATÁLOGO (veredito compacto; `null` = sem veredito) — preenchida pela rota da visão Itens. */
  catalogo?: ConferenciaCompacta | null;
};

export type DfdDetalhe = DfdResumo & {
  orgaoEntidade: string | null;
  matricula: string | null;
  email: string | null;
  telefone: string | null;
  nomeArquivo: string | null;
  secoes: DfdSecaoRow[];
  assinaturas: Assinatura[];
  itens: DfdItemRow[];
};

/** Lê o JSON de `secoes` com tolerância a dados inválidos. */
function parseSecoes(json: string | null): DfdSecaoRow[] {
  if (!json) return [];
  try {
    const arr: unknown = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((s): s is DfdSecaoRow => !!s && typeof s === "object" && "titulo" in s)
      .map((s) => ({ numero: Number(s.numero) || 0, titulo: String(s.titulo ?? ""), texto: String(s.texto ?? "") }));
  } catch {
    return [];
  }
}

const S = (v: unknown): string => String(v ?? "");

/** Lê o JSON de `assinaturas` (Assinatura[]) com tolerância a dados inválidos. */
export function parseAssinaturas(json: string | null): Assinatura[] {
  if (!json) return [];
  try {
    const arr: unknown = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
      .map((a) => ({
        nome: S(a.nome),
        eCpf: S(a.eCpf),
        usuario: S(a.usuario),
        local: S(a.local),
        data: S(a.data),
        ip: S(a.ip),
        codigo: S(a.codigo),
        url: S(a.url),
        fonte: coerceFonte(a.fonte),
        ...(a.ocr === true ? { ocr: true } : {}),
        ...(coerceValidacao(a.validacao) ? { validacao: coerceValidacao(a.validacao) } : {}),
      }));
  } catch {
    return [];
  }
}

const colunasDfd = {
  id: dfds.id,
  numero: dfds.numero,
  planejamento: dfds.planejamento,
  tipo: dfds.tipo,
  objeto: dfds.objeto,
  setorRequisitante: dfds.setorRequisitante,
  responsavel: dfds.responsavel,
  valorTotal: dfds.valorTotal,
  totalItens: dfds.totalItens,
  atualizadoEm: dfds.atualizadoEm,
  reparticaoId: dfds.reparticaoId,
  reparticaoCodigo: reparticoes.codigo,
  reparticaoNome: reparticoes.nome,
  protocoloId: dfds.protocoloId,
  protocoloNumero: dfdProtocolos.numero,
  protocoloAssunto: dfdProtocolos.assunto,
  protocoloAnoPca: dfdProtocolos.anoPca,
  anoPca: dfds.anoPca,
  prioridadeTexto: prioridadeTextoSql,
  protocoloResponsavelId: dfdProtocolos.responsavelId,
  numeroContrato: dfds.numeroContrato,
  numeroAta: dfds.numeroAta,
  numeroLicitacao: dfds.numeroLicitacao,
  protocoloPcaId: dfdProtocolos.pcaId,
  protocoloPcaIncorporadoEm: dfdProtocolos.pcaIncorporadoEm,
};

/** Escopo da Mesa: a PRINCIPAL (DFDs fora de protocolo enviado a um PCA) ou a de um PCA (`pcaId`). */
const escopoMesa = (pcaId?: number) => (pcaId ? eq(dfdProtocolos.pcaId, pcaId) : isNull(dfdProtocolos.pcaId));

/** Linha crua de `colunasDfd` (a prioridade ainda como TEXTO da seção, os grupos de assinatura ainda por derivar). */
type DfdResumoCru = Omit<DfdResumo, "assinaturaGrupos" | "prioridade"> & { prioridadeTexto: string | null };

/** Resumo + grupos de assinatura (Centi/Dropsigner/Adobe/Foxit) derivados do JSON + a prioridade normalizada.
 * `colunasDfd` NÃO traz as assinaturas (peso) → seleciona só aqui e mapeia para os grupos (leve). */
function comGrupos(r: DfdResumoCru & { assinaturas: string | null }): DfdResumo {
  const { assinaturas, prioridadeTexto, ...resto } = r;
  return { ...resto, prioridade: normPrioridade(prioridadeTexto).valor, assinaturaGrupos: gruposAssinatura(parseAssinaturas(assinaturas)) };
}

/** DFDs (opcionalmente filtrados por repartição — Geral passa `undefined`). */
/** `anoPca` = o PCA escolhido no CABEÇALHO (Mesa principal; `null` = todos os PCAs). */
export async function listarDfds(reparticaoId?: number, pcaId?: number, anoPca?: number | null): Promise<DfdResumo[]> {
  const rows = await getDb()
    .select({ ...colunasDfd, assinaturas: dfds.assinaturas })
    .from(dfds)
    .leftJoin(reparticoes, eq(dfds.reparticaoId, reparticoes.id))
    .leftJoin(dfdProtocolos, eq(dfds.protocoloId, dfdProtocolos.id))
    .where(and(escopoMesa(pcaId), reparticaoId ? eq(dfds.reparticaoId, reparticaoId) : undefined, filtroAnoPcaDfd(anoPca)))
    .orderBy(asc(reparticoes.ordem), asc(dfds.numero));
  return rows.map(comGrupos);
}

/** DFDs vinculados a um protocolo (detalhe do protocolo). Reusa `colunasDfd`. */
export async function listarDfdsDoProtocolo(protocoloId: number): Promise<DfdResumo[]> {
  const rows = await getDb()
    .select({ ...colunasDfd, assinaturas: dfds.assinaturas })
    .from(dfds)
    .leftJoin(reparticoes, eq(dfds.reparticaoId, reparticoes.id))
    .leftJoin(dfdProtocolos, eq(dfds.protocoloId, dfdProtocolos.id))
    .where(eq(dfds.protocoloId, protocoloId))
    .orderBy(asc(reparticoes.ordem), asc(dfds.numero));
  return rows.map(comGrupos);
}

/**
 * Lista PLANA de TODOS os itens dos DFDs em escopo (visão "Itens" da tela DFD) — cada item
 * enriquecido com o DFD/unidade/protocolo de origem. Escopado por unidade como `listarDfds`
 * (Geral ⇒ `undefined` = todos). Carregado sob demanda (lazy) só ao abrir a visão Itens.
 */
export async function listarItensDfds(reparticaoId?: number, pcaId?: number, anoPca?: number | null): Promise<ItemDfdRow[]> {
  return getDb()
    .select({
      id: dfdItens.id,
      dfdId: dfds.id,
      dfdNumero: dfds.numero,
      dfdPlanejamento: dfds.planejamento,
      sigla: reparticoes.codigo,
      reparticaoId: dfds.reparticaoId,
      protocoloNumero: dfdProtocolos.numero,
      protocoloAssunto: dfdProtocolos.assunto,
      dfdTipo: dfds.tipo,
      item: dfdItens.item,
      codigo: dfdItens.codigo,
      descricao: dfdItens.descricao,
      unidade: dfdItens.unidade,
      quantidade: dfdItens.quantidade,
      valorUnitario: dfdItens.valorUnitario,
      valorTotal: dfdItens.valorTotal,
      pcaSequencial: pcaItens.sequencial,
      pcaAtivo: pcaItens.ativo,
    })
    .from(dfdItens)
    .innerJoin(dfds, eq(dfdItens.dfdId, dfds.id))
    .leftJoin(reparticoes, eq(dfds.reparticaoId, reparticoes.id))
    .leftJoin(dfdProtocolos, eq(dfds.protocoloId, dfdProtocolos.id))
    // O nº do item NESTE PCA (Mesa do PCA); na Mesa principal não casa nada (−1).
    .leftJoin(pcaItens, and(eq(pcaItens.dfdItemId, dfdItens.id), eq(pcaItens.pcaId, pcaId ?? -1)))
    .where(and(escopoMesa(pcaId), reparticaoId ? eq(dfds.reparticaoId, reparticaoId) : undefined, filtroAnoPcaDfd(anoPca)))
    .orderBy(asc(reparticoes.ordem), asc(dfds.numero), asc(dfdItens.sequencial));
}

/** Colunas do DETALHE do DFD (resumo + cabeçalho completo + seções/assinaturas em JSON). A prioridade sai das seções já
 * lidas (`paraDetalhe`) — o JSON não é lido duas vezes. */
const { prioridadeTexto: _prioridadeNoBanco, ...colunasResumoDetalhe } = colunasDfd;
const colunasDetalhe = {
  ...colunasResumoDetalhe,
  orgaoEntidade: dfds.orgaoEntidade,
  matricula: dfds.matricula,
  email: dfds.email,
  telefone: dfds.telefone,
  nomeArquivo: dfds.nomeArquivo,
  secoes: dfds.secoes,
  assinaturas: dfds.assinaturas,
};
const colunasItem = {
  id: dfdItens.id,
  dfdId: dfdItens.dfdId,
  item: dfdItens.item,
  codigo: dfdItens.codigo,
  descricao: dfdItens.descricao,
  unidade: dfdItens.unidade,
  quantidade: dfdItens.quantidade,
  valorUnitario: dfdItens.valorUnitario,
  valorTotal: dfdItens.valorTotal,
};

/** Linha crua do detalhe → `DfdDetalhe` (JSON de seções/assinaturas lido com tolerância; a prioridade pela seção). */
function paraDetalhe(
  d: Omit<DfdResumoCru, "prioridadeTexto"> & {
    orgaoEntidade: string | null;
    matricula: string | null;
    email: string | null;
    telefone: string | null;
    nomeArquivo: string | null;
    secoes: string | null;
    assinaturas: string | null;
  },
  itens: DfdItemRow[],
): DfdDetalhe {
  const assinaturas = parseAssinaturas(d.assinaturas);
  const secoes = parseSecoes(d.secoes);
  return {
    ...d,
    prioridade: prioridadeDoDfd(secoes),
    secoes,
    assinaturas,
    assinaturaGrupos: gruposAssinatura(assinaturas),
    itens,
  };
}

export async function getDfd(id: number): Promise<DfdDetalhe | null> {
  const db = getDb();
  const [d] = await db
    .select(colunasDetalhe)
    .from(dfds)
    .leftJoin(reparticoes, eq(dfds.reparticaoId, reparticoes.id))
    .leftJoin(dfdProtocolos, eq(dfds.protocoloId, dfdProtocolos.id))
    .where(eq(dfds.id, id))
    .limit(1);
  if (!d) return null;
  const itens = await db.select(colunasItem).from(dfdItens).where(eq(dfdItens.dfdId, id)).orderBy(asc(dfdItens.sequencial));
  return paraDetalhe(d, itens.map(({ dfdId: _d, ...it }) => it));
}

/**
 * TODOS os DFDs de um protocolo COMPLETOS (cabeçalho + seções + assinaturas + itens) — o protocolo
 * GRAVADO usa os MESMOS componentes/conferência da análise, então precisa do DFD inteiro. Duas
 * consultas (DFDs + itens por JOIN no protocolo — sem lista de ids, sem limite de parâmetros).
 */
export async function listarDfdsCompletosDoProtocolo(protocoloId: number): Promise<DfdDetalhe[]> {
  const db = getDb();
  const [linhas, itens] = await Promise.all([
    db
      .select(colunasDetalhe)
      .from(dfds)
      .leftJoin(reparticoes, eq(dfds.reparticaoId, reparticoes.id))
      .leftJoin(dfdProtocolos, eq(dfds.protocoloId, dfdProtocolos.id))
      .where(eq(dfds.protocoloId, protocoloId))
      .orderBy(asc(reparticoes.ordem), asc(dfds.numero)),
    db
      .select(colunasItem)
      .from(dfdItens)
      .innerJoin(dfds, eq(dfdItens.dfdId, dfds.id))
      .where(eq(dfds.protocoloId, protocoloId))
      .orderBy(asc(dfdItens.dfdId), asc(dfdItens.sequencial)),
  ]);
  const porDfd = new Map<number, DfdItemRow[]>();
  for (const { dfdId, ...it } of itens) {
    const arr = porDfd.get(dfdId);
    if (arr) arr.push(it);
    else porDfd.set(dfdId, [it]);
  }
  return linhas.map((d) => paraDetalhe(d, porDfd.get(d.id) ?? []));
}

/** Tamanho do lote de ids por `IN (...)` — folga sob o limite de 100 parâmetros do D1. */
const LOTE_IDS = 90;

/**
 * DFDs (por id) COMPLETOS para a CONFERÊNCIA da lista da Mesa (`/api/dfd/conferencia`) — mesmo
 * detalhe do banner, em lotes de ids (≤ 90 por `IN`). O cliente pede em fatias (ex.: 150 DFDs).
 */
export async function listarDfdsCompletosPorIds(ids: number[]): Promise<DfdDetalhe[]> {
  const uniq = [...new Set(ids)].filter((n) => Number.isInteger(n) && n > 0);
  if (uniq.length === 0) return [];
  const db = getDb();
  const out: DfdDetalhe[] = [];
  for (let i = 0; i < uniq.length; i += LOTE_IDS) {
    const lote = uniq.slice(i, i + LOTE_IDS);
    const [linhas, itens] = await Promise.all([
      db
        .select(colunasDetalhe)
        .from(dfds)
        .leftJoin(reparticoes, eq(dfds.reparticaoId, reparticoes.id))
        .leftJoin(dfdProtocolos, eq(dfds.protocoloId, dfdProtocolos.id))
        .where(inArray(dfds.id, lote)),
      db.select(colunasItem).from(dfdItens).where(inArray(dfdItens.dfdId, lote)).orderBy(asc(dfdItens.dfdId), asc(dfdItens.sequencial)),
    ]);
    const porDfd = new Map<number, DfdItemRow[]>();
    for (const { dfdId, ...it } of itens) {
      const arr = porDfd.get(dfdId);
      if (arr) arr.push(it);
      else porDfd.set(dfdId, [it]);
    }
    for (const d of linhas) out.push(paraDetalhe(d, porDfd.get(d.id) ?? []));
  }
  return out;
}

/**
 * TODOS os DFDs COMPLETOS de VÁRIOS protocolos (conferência agregada da lista de protocolos da Mesa —
 * `/api/protocolo/conferencia`), em lotes de ids de protocolo (≤ 90 por `IN`). Itens por JOIN no protocolo.
 */
export async function listarDfdsCompletosDosProtocolos(protocoloIds: number[]): Promise<DfdDetalhe[]> {
  const uniq = [...new Set(protocoloIds)].filter((n) => Number.isInteger(n) && n > 0);
  const db = getDb();
  const out: DfdDetalhe[] = [];
  for (const lote of lotesDeIds(uniq)) {
    const [linhas, itens] = await Promise.all([
      db
        .select(colunasDetalhe)
        .from(dfds)
        .leftJoin(reparticoes, eq(dfds.reparticaoId, reparticoes.id))
        .leftJoin(dfdProtocolos, eq(dfds.protocoloId, dfdProtocolos.id))
        .where(inArray(dfds.protocoloId, lote)),
      db
        .select(colunasItem)
        .from(dfdItens)
        .innerJoin(dfds, eq(dfdItens.dfdId, dfds.id))
        .where(inArray(dfds.protocoloId, lote))
        .orderBy(asc(dfdItens.dfdId), asc(dfdItens.sequencial)),
    ]);
    const porDfd = new Map<number, DfdItemRow[]>();
    for (const { dfdId, ...it } of itens) {
      const arr = porDfd.get(dfdId);
      if (arr) arr.push(it);
      else porDfd.set(dfdId, [it]);
    }
    for (const d of linhas) out.push(paraDetalhe(d, porDfd.get(d.id) ?? []));
  }
  return out;
}

/** Campos que a EDIÇÃO EM MASSA lê/altera (sem itens — leve), por lotes de ids. */
export async function listarCamposMassa(ids: number[]): Promise<
  {
    id: number;
    numero: string;
    planejamento: string | null;
    protocoloId: number | null;
    reparticaoId: number | null;
    tipo: string | null;
    nomeArquivo: string | null;
    secoes: DfdSecaoRow[];
    assinaturas: Assinatura[];
  }[]
> {
  const uniq = [...new Set(ids)].filter((n) => Number.isInteger(n) && n > 0);
  const out = [];
  for (let i = 0; i < uniq.length; i += LOTE_IDS) {
    const linhas = await getDb()
      .select({
        id: dfds.id,
        numero: dfds.numero,
        planejamento: dfds.planejamento,
        protocoloId: dfds.protocoloId,
        reparticaoId: dfds.reparticaoId,
        tipo: dfds.tipo,
        nomeArquivo: dfds.nomeArquivo,
        secoes: dfds.secoes,
        assinaturas: dfds.assinaturas,
      })
      .from(dfds)
      .where(inArray(dfds.id, uniq.slice(i, i + LOTE_IDS)));
    for (const l of linhas) out.push({ ...l, secoes: parseSecoes(l.secoes), assinaturas: parseAssinaturas(l.assinaturas) });
  }
  return out;
}

// ---- Edição EM MASSA de ITENS (lista "Itens" da Mesa) ----

/** Os ITENS pedidos (com o DFD de cada um) — a massa lê só o que vai mudar, em lotes de ids. */
export async function itensParaMassa(ids: number[]): Promise<(ItemMassa & { dfdId: number })[]> {
  const uniq = [...new Set(ids)].filter((n) => Number.isInteger(n) && n > 0);
  const out: (ItemMassa & { dfdId: number })[] = [];
  for (let i = 0; i < uniq.length; i += LOTE_IDS) {
    const linhas = await getDb()
      .select({
        id: dfdItens.id,
        dfdId: dfdItens.dfdId,
        item: dfdItens.item,
        codigo: dfdItens.codigo,
        descricao: dfdItens.descricao,
        unidade: dfdItens.unidade,
        quantidade: dfdItens.quantidade,
        valorUnitario: dfdItens.valorUnitario,
        valorTotal: dfdItens.valorTotal,
      })
      .from(dfdItens)
      .where(inArray(dfdItens.id, uniq.slice(i, i + LOTE_IDS)))
      .orderBy(asc(dfdItens.dfdId), asc(dfdItens.sequencial));
    out.push(...linhas);
  }
  return out;
}

/** Cabeçalho dos DFDs da massa (nº, planejamento, protocolo, unidade) + QUANTOS itens cada um tem (trava
 * "nunca sem itens"). */
export async function dfdsParaMassa(
  dfdIds: number[],
): Promise<{ id: number; numero: string; planejamento: string | null; protocoloId: number | null; reparticaoId: number | null; totalItens: number }[]> {
  const uniq = [...new Set(dfdIds)].filter((n) => Number.isInteger(n) && n > 0);
  if (uniq.length === 0) return [];
  const db = getDb();
  const [cab, contagens] = await Promise.all([
    db
      .select({ id: dfds.id, numero: dfds.numero, planejamento: dfds.planejamento, protocoloId: dfds.protocoloId, reparticaoId: dfds.reparticaoId })
      .from(dfds)
      .where(inArray(dfds.id, uniq)),
    db
      .select({ dfdId: dfdItens.dfdId, n: sql<number>`COUNT(*)` })
      .from(dfdItens)
      .where(inArray(dfdItens.dfdId, uniq))
      .groupBy(dfdItens.dfdId),
  ]);
  const porDfd = new Map(contagens.map((c) => [c.dfdId, Number(c.n)]));
  return cab.map((c) => ({ ...c, totalItens: porDfd.get(c.id) ?? 0 }));
}

/** Colunas do item que a massa altera (propriedade Drizzle → coluna SQL). */
const COL_ITEM: Record<keyof PatchItem, string> = {
  descricao: "descricao",
  unidade: "unidade",
  quantidade: "quantidade",
  valorUnitario: "valor_unitario",
  valorTotal: "valor_total",
};

/**
 * Aplica o PLANO de massa de UM DFD num `db.batch` ATÔMICO: os patches viram `UPDATE … SET col = CASE
 * id WHEN ? THEN ? … END` em blocos que cabem nos 100 parâmetros do D1 (poucas consultas mesmo com
 * centenas de itens), as remoções um `DELETE … IN` e os totais do DFD são RECALCULADOS NO BANCO (Σ dos
 * itens, no mesmo lote) — nunca de um retrato lido antes: uma edição concorrente no mesmo DFD não deixa o
 * total divergir dos itens. Cada DELETE só roda se, depois de TODAS as remoções, sobrar ≥ 1 item.
 */
export async function aplicarPlanoItens(dfdId: number, plano: PlanoMassaItens): Promise<void> {
  const db = getDb();
  const stmts: unknown[] = [];
  const campos = [...new Set(plano.atualizar.flatMap((a) => Object.keys(a.patch)))] as (keyof PatchItem)[];
  if (campos.length > 0) {
    // Parâmetros por item: 2 por campo (WHEN id THEN valor) + 1 no IN; + o dfdId.
    const porBloco = Math.max(1, Math.floor(98 / (2 * campos.length + 1)));
    for (let i = 0; i < plano.atualizar.length; i += porBloco) {
      const bloco = plano.atualizar.slice(i, i + porBloco);
      const set: Record<string, SQL> = {};
      for (const c of campos) {
        const quando = bloco.filter((a) => c in a.patch).map((a) => sql`WHEN ${a.id} THEN ${a.patch[c] ?? null}`);
        if (quando.length === 0) continue;
        set[c] = sql`CASE ${sql.raw('"id"')} ${sql.join(quando, sql` `)} ELSE ${sql.raw(`"${COL_ITEM[c]}"`)} END`;
      }
      stmts.push(
        db
          .update(dfdItens)
          .set(set)
          .where(and(eq(dfdItens.dfdId, dfdId), inArray(dfdItens.id, bloco.map((a) => a.id)))),
      );
    }
  }
  for (let i = 0; i < plano.remover.length; i += LOTE_IDS) {
    const restantes = plano.remover.length - i; // a remover deste lote em diante
    stmts.push(
      db
        .delete(dfdItens)
        .where(
          and(
            eq(dfdItens.dfdId, dfdId),
            inArray(dfdItens.id, plano.remover.slice(i, i + LOTE_IDS)),
            sql`(SELECT COUNT(*) FROM ${dfdItens} WHERE ${dfdItens.dfdId} = ${dfdId}) > ${restantes}`,
          ),
        ),
    );
  }
  // Mesma régua do `reescreverDfdItens`: Σ > 0 ⇒ o valor (2 casas); senão NULL.
  const soma = sql`SUM(COALESCE(${dfdItens.valorTotal}, 0))`;
  stmts.push(
    db
      .update(dfds)
      .set({
        totalItens: sql`(SELECT COUNT(*) FROM ${dfdItens} WHERE ${dfdItens.dfdId} = ${dfdId})`,
        valorTotal: sql`(SELECT CASE WHEN ${soma} > 0 THEN ROUND(${soma}, 2) END FROM ${dfdItens} WHERE ${dfdItens.dfdId} = ${dfdId})`,
        atualizadoEm: sql`(CURRENT_TIMESTAMP)`,
      })
      .where(eq(dfds.id, dfdId)),
  );
  type Stmt = Parameters<typeof db.batch>[0][number];
  await db.batch(stmts as [Stmt, ...Stmt[]]);
}

/**
 * `start-dfd`: cria (ou substitui, pelo `numero`) o CABEÇALHO do DFD, **apaga os itens antigos** e grava o
 * 1º lote — TUDO num `db.batch` atômico (tudo ou nada: uma nova tentativa encontra o DFD como estava).
 * `totalItens` é o total DECLARADO (o cliente envia os itens em lotes via `appendDfdItens`). Retomável:
 * reexecutar zera e regrava. Base do import de 1 DFD e do protocolo.
 * - `protocoloId` AUSENTE ou nulo (DFD avulso / sobrescrita pelo banner) MANTÉM o protocolo do DFD que já
 *   existia — o `start-dfd` nunca desvincula (desvincular é o PATCH do vínculo).
 * - RASTRO entre protocolos (`rastro-sql.ts`): o DFD estava vivo em OUTRO protocolo e vai para `protocoloId`
 *   → o de origem guarda o retrato (cinza, "sobrescrito pelo protocolo X"), lido do banco no MESMO lote; e o
 *   destino perde um rastro antigo desse DFD (ele volta a estar vivo lá).
 */
export async function upsertDfdCabecalho(
  dados: DfdMetaPayload,
  criadoPor: number | null,
  primeiroLote: DfdItemPayload[],
): Promise<{ id: number; numero: string }> {
  const db = getDb();
  const set = {
    planejamento: dados.planejamento ?? null,
    tipo: dados.tipo ?? null,
    objeto: dados.objeto ?? null,
    orgaoEntidade: dados.orgaoEntidade ?? null,
    setorRequisitante: dados.setorRequisitante ?? null,
    siglaSetor: dados.siglaSetor ?? null,
    reparticaoId: dados.reparticaoId ?? null,
    // Ponto 4: o DFD registra o ÓRGÃO — derivado da unidade escolhida (unidade ∈ órgão).
    orgaoId: dados.reparticaoId != null ? sql`(SELECT orgao_id FROM reparticoes WHERE id = ${dados.reparticaoId})` : null,
    // Ausente/nulo = mantém o protocolo atual (avulso/sobrescrita não desvincula).
    ...(dados.protocoloId != null ? { protocoloId: dados.protocoloId } : {}),
    responsavel: dados.responsavel ?? null,
    matricula: dados.matricula ?? null,
    email: dados.email ?? null,
    telefone: dados.telefone ?? null,
    anoPca: dados.anoPca ?? null,
    // Referências (DFD-R): várias por campo — gravadas no formato canônico "a; b" (`juntarRefs`).
    numeroContrato: juntarRefs([dados.numeroContrato]),
    numeroAta: juntarRefs([dados.numeroAta]),
    numeroLicitacao: juntarRefs([dados.numeroLicitacao]),
    valorTotal: dados.valorTotal ?? null,
    secoes: dados.secoes && dados.secoes.length > 0 ? JSON.stringify(dados.secoes) : null,
    assinaturas: dados.assinaturas && dados.assinaturas.length > 0 ? JSON.stringify(dados.assinaturas) : null,
    nomeArquivo: dados.nomeArquivo ?? null,
    totalItens: dados.totalItens ?? primeiroLote.length,
    atualizadoEm: sql`(CURRENT_TIMESTAMP)`,
  };
  type Stmt = Parameters<typeof db.batch>[0][number];
  // RASTRO (antes do upsert: o retrato lê o protocolo em que o DFD ESTAVA) — só quando vai para um protocolo.
  const rastro: Stmt[] =
    dados.protocoloId != null
      ? [retratoRastro(db, dados.numero, dados.protocoloId, criadoPor), limparRastroDestino(db, dados.numero, dados.protocoloId)]
      : [];
  const upsert = db
    .insert(dfds)
    .values({ numero: dados.numero, criadoPor: criadoPor ?? null, protocoloId: dados.protocoloId ?? null, ...set })
    .onConflictDoUpdate({ target: dfds.numero, set })
    .returning({ id: dfds.id });
  // O id do DFD DENTRO do lote (a linha é criada/atualizada nele mesmo): pelo `numero` (único).
  const idDoDfd = sql`(SELECT id FROM dfds WHERE numero = ${dados.numero})`;
  const res = await db.batch([
    ...rastro,
    upsert,
    db.delete(dfdItens).where(eq(dfdItens.dfdId, idDoDfd)),
    ...insertsItens(db, idDoDfd, primeiroLote, 0),
  ] as [Stmt, ...Stmt[]]);
  const id = (res[rastro.length] as { id: number }[])[0].id;
  return { id, numero: dados.numero };
}

/** `append-dfd-itens`: acrescenta um lote de itens a um DFD já iniciado (batch). */
export async function appendDfdItens(
  dfdId: number,
  itens: DfdItemPayload[],
  seqBase: number,
): Promise<{ inserted: number }> {
  if (itens.length === 0) return { inserted: 0 };
  const db = getDb();
  const stmts = insertsItens(db, dfdId, itens, seqBase);
  // Idempotente: apaga o que já houver ALÉM de `seqBase` antes de gravar o lote —
  // reenviar o mesmo lote (retry) não duplica itens. Atômico no mesmo db.batch.
  await db.batch([
    db.delete(dfdItens).where(and(eq(dfdItens.dfdId, dfdId), gt(dfdItens.sequencial, seqBase))),
    ...stmts,
  ] as [(typeof stmts)[number], ...(typeof stmts)[number][]]);
  return { inserted: itens.length };
}

/**
 * Edita campos de um DFD JÁ GRAVADO (banner destravado): repartição, tipo (por seleção), seções
 * (tratamento), refs de renovação e o **CONTEÚDO do cabeçalho** (objeto/órgão/setor/responsável/
 * matrícula/e-mail/telefone). Os **IDENTIFICADORES** (número/planejamento) NÃO estão aqui →
 * imutáveis. Não toca nos itens. Grava direto no D1 (`atualizadoEm` renovado).
 */
export async function atualizarDfdCampos(
  id: number,
  campos: {
    reparticaoId?: number | null;
    tipo?: string | null;
    assinaturas?: Assinatura[];
    secoes?: DfdSecaoRow[];
    numeroContrato?: string | null;
    numeroAta?: string | null;
    numeroLicitacao?: string | null;
    objeto?: string | null;
    orgaoEntidade?: string | null;
    setorRequisitante?: string | null;
    responsavel?: string | null;
    matricula?: string | null;
    email?: string | null;
    telefone?: string | null;
  },
): Promise<void> {
  const set: Record<string, unknown> = { atualizadoEm: sql`(CURRENT_TIMESTAMP)` };
  if (campos.reparticaoId !== undefined) {
    set.reparticaoId = campos.reparticaoId;
    // O DFD registra o ÓRGÃO derivado da unidade (como no `upsertDfdCabecalho`) — segue a troca.
    set.orgaoId = campos.reparticaoId != null ? sql`(SELECT orgao_id FROM reparticoes WHERE id = ${campos.reparticaoId})` : null;
  }
  if (campos.tipo !== undefined) set.tipo = campos.tipo || null;
  if (campos.assinaturas !== undefined) set.assinaturas = campos.assinaturas.length > 0 ? JSON.stringify(campos.assinaturas) : null;
  if (campos.secoes !== undefined) set.secoes = campos.secoes.length > 0 ? JSON.stringify(campos.secoes) : null;
  if (campos.numeroContrato !== undefined) set.numeroContrato = juntarRefs([campos.numeroContrato]);
  if (campos.numeroAta !== undefined) set.numeroAta = juntarRefs([campos.numeroAta]);
  if (campos.numeroLicitacao !== undefined) set.numeroLicitacao = juntarRefs([campos.numeroLicitacao]);
  if (campos.objeto !== undefined) set.objeto = campos.objeto || null;
  if (campos.orgaoEntidade !== undefined) set.orgaoEntidade = campos.orgaoEntidade || null;
  if (campos.setorRequisitante !== undefined) set.setorRequisitante = campos.setorRequisitante || null;
  if (campos.responsavel !== undefined) set.responsavel = campos.responsavel || null;
  if (campos.matricula !== undefined) set.matricula = campos.matricula || null;
  if (campos.email !== undefined) set.email = campos.email || null;
  if (campos.telefone !== undefined) set.telefone = campos.telefone || null;
  await getDb().update(dfds).set(set).where(eq(dfds.id, id));
}

/**
 * Reescreve TODOS os itens (`dfd_itens`) de um DFD já gravado (edição de item no banner
 * destravado) — apaga + reinsere num único `db.batch` (atômico) e recomputa o `valorTotal`
 * (Σ dos itens) e `totalItens` do cabeçalho. Só código/descrição/unidade/quantidade/valores
 * do item mudam; a capa e as seções seguem por `atualizarDfdCampos`.
 */
export async function reescreverDfdItens(dfdId: number, itens: DfdItemPayload[]): Promise<void> {
  const db = getDb();
  const soma = itens.reduce((s, it) => s + (it.valorTotal ?? 0), 0);
  const valorTotal = soma > 0 ? Math.round(soma * 100) / 100 : null;
  const stmts = insertsItens(db, dfdId, itens, 0);
  await db.batch([
    db.delete(dfdItens).where(eq(dfdItens.dfdId, dfdId)),
    ...stmts,
  ] as [(typeof stmts)[number], ...(typeof stmts)[number][]]);
  await db
    .update(dfds)
    .set({ valorTotal, totalItens: itens.length, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(dfds.id, dfdId));
}

/** Repartição de um DFD (para o guard de acesso nas escritas); `null` se não existe. */
export async function getDfdReparticao(
  id: number,
): Promise<{
  reparticaoId: number | null;
  tipo: string | null;
  protocoloId: number | null;
  numero: string;
  planejamento: string | null;
  criadoPor: number | null;
  criadoEm: string | null;
} | null> {
  const [r] = await getDb()
    .select({
      reparticaoId: dfds.reparticaoId,
      tipo: dfds.tipo,
      protocoloId: dfds.protocoloId,
      numero: dfds.numero,
      planejamento: dfds.planejamento,
      criadoPor: dfds.criadoPor,
      criadoEm: dfds.criadoEm,
    })
    .from(dfds)
    .where(eq(dfds.id, id))
    .limit(1);
  return r ?? null;
}

/** Assinaturas + nome do arquivo de um DFD gravado (para reconferir a assinatura ao
 * mudar a repartição no PATCH); `null` se não existe. */
export async function getDfdAssinaturas(
  id: number,
): Promise<{ nomeArquivo: string | null; assinaturas: Assinatura[] } | null> {
  const [r] = await getDb()
    .select({ nomeArquivo: dfds.nomeArquivo, assinaturas: dfds.assinaturas })
    .from(dfds)
    .where(eq(dfds.id, id))
    .limit(1);
  if (!r) return null;
  return { nomeArquivo: r.nomeArquivo, assinaturas: parseAssinaturas(r.assinaturas) };
}

/** DFD JÁ CADASTRADO (mesmo nº) — o conflito de uma importação (sobrescrita): de qual protocolo é, a unidade
 * (escopo) e os totais (a somatória quando ele prevalece). */
export type DfdExistente = {
  id: number;
  numero: string;
  reparticaoId: number | null;
  protocoloId: number | null;
  protocoloNumero: string | null;
  valorTotal: number | null;
  totalItens: number | null;
};

/** Os DFDs cadastrados com esses NÚMEROS (lotes de ≤ 90 no `IN`) — a importação sabe, ANTES de gravar, quem
 * vai sobrescrever quem (em QUALQUER unidade — a lista da Mesa é filtrada pela unidade do cabeçalho). */
export async function dfdsPorNumeros(numeros: string[]): Promise<DfdExistente[]> {
  const uniq = [...new Set(numeros.map((n) => n.trim()).filter(Boolean))];
  if (uniq.length === 0) return [];
  const db = getDb();
  const out: DfdExistente[] = [];
  for (let i = 0; i < uniq.length; i += LOTE_IDS) {
    out.push(
      ...(await db
        .select({
          id: dfds.id,
          numero: dfds.numero,
          reparticaoId: dfds.reparticaoId,
          protocoloId: dfds.protocoloId,
          protocoloNumero: dfdProtocolos.numero,
          valorTotal: dfds.valorTotal,
          totalItens: dfds.totalItens,
        })
        .from(dfds)
        .leftJoin(dfdProtocolos, eq(dfds.protocoloId, dfdProtocolos.id))
        .where(inArray(dfds.numero, uniq.slice(i, i + LOTE_IDS)))),
    );
  }
  return out;
}

/** O DFD com esse `numero` (anti-sequestro e histórico no `start-dfd`); `null` se não existe. */
export async function getReparticaoDfdNumero(
  numero: string,
): Promise<{ id: number; reparticaoId: number | null; protocoloId: number | null; assinaturas: Assinatura[] } | null> {
  const [r] = await getDb()
    .select({ id: dfds.id, reparticaoId: dfds.reparticaoId, protocoloId: dfds.protocoloId, assinaturas: dfds.assinaturas })
    .from(dfds)
    .where(eq(dfds.numero, numero))
    .limit(1);
  return r ? { id: r.id, reparticaoId: r.reparticaoId, protocoloId: r.protocoloId, assinaturas: parseAssinaturas(r.assinaturas) } : null;
}

/** Exclui um DFD. Bloqueia se ele fizer parte de alguma edição de PCA. */
export async function excluirDfd(id: number): Promise<{ ok: true } | { ok: false; erro: string }> {
  const db = getDb();
  const [ref] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(pcaDfds)
    .where(eq(pcaDfds.dfdId, id));
  if (Number(ref?.n ?? 0) > 0) {
    return {
      ok: false,
      erro: "Este DFD faz parte de uma ou mais edições de PCA. Remova-o da edição ou exclua a edição antes.",
    };
  }
  await db.delete(dfds).where(eq(dfds.id, id)); // cascade apaga dfd_itens
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Edições de PCA (compilação de DFDs)
// ---------------------------------------------------------------------------

export type PcaResumo = {
  id: number;
  nome: string;
  ano: number | null;
  ativo: boolean | null;
  totalDfds: number | null;
  totalItens: number | null;
  valorEstimado: number | null;
  criadoEm: string | null;
  /** Fonte do PCA como espaço (migração `0033`) — só os de `protocolo` recebem protocolos da Mesa. */
  fonte?: "lista" | "protocolo";
};

export type PcaDfdBloco = {
  id: number;
  numero: string;
  objeto: string | null;
  setorRequisitante: string | null;
  valorTotal: number | null;
  totalItens: number | null;
  itens: DfdItemRow[];
};

export type PcaReparticaoGrupo = {
  reparticaoId: number | null;
  reparticaoCodigo: string | null;
  reparticaoNome: string | null;
  dfds: PcaDfdBloco[];
};

export type PcaDetalhe = PcaResumo & {
  observacao: string | null;
  grupos: PcaReparticaoGrupo[];
};

/** O cadastro de PCAs (o ativo primeiro). Memorizado POR REQUISIÇÃO (`cache` do React): o layout (o seletor de PCA do
 * cabeçalho) e a página (Mesa, PCA, Orçamento) leem o MESMO resultado numa consulta só; fora da renderização (rotas) não
 * memoriza. `async` = uma Promise de verdade (o construtor do Drizzle executaria a consulta a cada `await`). Quem recebe a
 * lista não a altera (é compartilhada). */
export const listarPcas = cache(
  async (): Promise<PcaResumo[]> =>
    getDb()
      .select({
        id: pcas.id,
        nome: pcas.nome,
        ano: pcas.ano,
        ativo: pcas.ativo,
        totalDfds: pcas.totalDfds,
        totalItens: pcas.totalItens,
        valorEstimado: pcas.valorEstimado,
        criadoEm: pcas.criadoEm,
        fonte: pcas.fonte,
      })
      .from(pcas)
      .orderBy(desc(pcas.ativo), desc(pcas.criadoEm), desc(pcas.id)),
);

/** Compilação de uma edição: DFDs agrupados por repartição (ordem da tela) + itens. */
export async function getPca(id: number): Promise<PcaDetalhe | null> {
  const db = getDb();
  const [p] = await db.select().from(pcas).where(eq(pcas.id, id)).limit(1);
  if (!p) return null;

  const linhas = await db
    .select({
      id: dfds.id,
      numero: dfds.numero,
      objeto: dfds.objeto,
      setorRequisitante: dfds.setorRequisitante,
      valorTotal: dfds.valorTotal,
      totalItens: dfds.totalItens,
      reparticaoId: dfds.reparticaoId,
      reparticaoCodigo: reparticoes.codigo,
      reparticaoNome: reparticoes.nome,
    })
    .from(pcaDfds)
    .innerJoin(dfds, eq(pcaDfds.dfdId, dfds.id))
    .leftJoin(reparticoes, eq(dfds.reparticaoId, reparticoes.id))
    .where(eq(pcaDfds.pcaId, id))
    .orderBy(asc(reparticoes.ordem), asc(dfds.numero));

  const ids = linhas.map((l) => l.id);
  const itens = ids.length
    ? await db
        .select({
          id: dfdItens.id,
          dfdId: dfdItens.dfdId,
          item: dfdItens.item,
          codigo: dfdItens.codigo,
          descricao: dfdItens.descricao,
          unidade: dfdItens.unidade,
          quantidade: dfdItens.quantidade,
          valorUnitario: dfdItens.valorUnitario,
          valorTotal: dfdItens.valorTotal,
        })
        .from(dfdItens)
        .where(inArray(dfdItens.dfdId, ids))
        .orderBy(asc(dfdItens.sequencial))
    : [];

  const itensPorDfd = new Map<number, DfdItemRow[]>();
  for (const it of itens) {
    const arr = itensPorDfd.get(it.dfdId) ?? [];
    arr.push({
      id: it.id,
      item: it.item,
      codigo: it.codigo,
      descricao: it.descricao,
      unidade: it.unidade,
      quantidade: it.quantidade,
      valorUnitario: it.valorUnitario,
      valorTotal: it.valorTotal,
    });
    itensPorDfd.set(it.dfdId, arr);
  }

  // Agrupa por repartição preservando a ordem já vinda do banco.
  const grupos: PcaReparticaoGrupo[] = [];
  const idx = new Map<number | null, number>();
  for (const l of linhas) {
    let g = idx.get(l.reparticaoId);
    if (g == null) {
      g = grupos.length;
      idx.set(l.reparticaoId, g);
      grupos.push({
        reparticaoId: l.reparticaoId,
        reparticaoCodigo: l.reparticaoCodigo,
        reparticaoNome: l.reparticaoNome,
        dfds: [],
      });
    }
    grupos[g].dfds.push({
      id: l.id,
      numero: l.numero,
      objeto: l.objeto,
      setorRequisitante: l.setorRequisitante,
      valorTotal: l.valorTotal,
      totalItens: l.totalItens,
      itens: itensPorDfd.get(l.id) ?? [],
    });
  }

  return { ...p, grupos };
}

/** Gera uma edição de PCA unindo os DFDs escolhidos (por referência). */
export async function gerarPca(
  dados: GerarPcaPayload,
  criadoPor: number | null,
): Promise<{ id: number } | { erro: string }> {
  const db = getDb();
  const uniq = [...new Set(dados.dfdIds)];
  // Em lotes de ids (≤ 90 por `IN`) — o "selecionar todos" pode trazer centenas de DFDs (limite de 100
  // parâmetros do D1).
  const encontrados: { id: number; valorTotal: number | null; totalItens: number | null }[] = [];
  for (const lote of lotesDeIds(uniq)) {
    encontrados.push(
      ...(await db.select({ id: dfds.id, valorTotal: dfds.valorTotal, totalItens: dfds.totalItens }).from(dfds).where(inArray(dfds.id, lote))),
    );
  }
  if (encontrados.length !== uniq.length) {
    return { erro: "Alguns DFDs selecionados não existem mais. Recarregue e tente de novo." };
  }
  const totalItens = encontrados.reduce((s, d) => s + (d.totalItens ?? 0), 0);
  // Valor do PCA = soma dos valores REAIS dos DFDs (Σ itens); sem estimativa.
  const valorEstimado = encontrados.reduce((s, d) => s + (d.valorTotal ?? 0), 0);

  const [p] = await db
    .insert(pcas)
    .values({
      nome: dados.nome,
      ano: dados.ano ?? null,
      observacao: dados.observacao ?? null,
      totalDfds: uniq.length,
      totalItens,
      valorEstimado,
      criadoPor: criadoPor ?? null,
    })
    .returning({ id: pcas.id });

  const id = p.id;
  // pca_dfds = 2 colunas → 50 linhas/statement.
  const stmts = [];
  for (let i = 0; i < uniq.length; i += 50) {
    stmts.push(db.insert(pcaDfds).values(uniq.slice(i, i + 50).map((dfdId) => ({ pcaId: id, dfdId }))));
  }
  if (stmts.length > 0) {
    await db.batch(stmts as [(typeof stmts)[number], ...(typeof stmts)[number][]]);
  }
  return { id };
}

/** Exclui o PCA: os protocolos da Mesa dele voltam à Mesa principal (e destravam) e `pca_dfds` cai em cascata. */
export async function excluirPca(id: number): Promise<void> {
  const db = getDb();
  await db.batch([
    db
      .update(dfdProtocolos)
      .set({ pcaId: null, pcaEnviadoEm: null, pcaEnviadoPor: null, pcaIncorporadoEm: null })
      .where(eq(dfdProtocolos.pcaId, id)),
    // O nº do item no PCA sai junto (a numeração em `pca_itens` cai por cascade).
    db.update(dfdItens).set({ pcaId: null, pcaSequencial: null }).where(eq(dfdItens.pcaId, id)),
    db.delete(pcas).where(eq(pcas.id, id)),
  ]);
}

/**
 * Registro leve de PCA (só nome + ano), cadastrado pelo ADM nas Configurações —
 * sem unir DFDs (totais 0). O fluxo de EDIÇÃO consolidada segue em `gerarPca`.
 */
export async function cadastrarPca(
  dados: CadastrarPcaPayload,
  criadoPor: number | null,
): Promise<{ id: number }> {
  const [p] = await getDb()
    .insert(pcas)
    .values({
      nome: dados.nome,
      ano: dados.ano ?? null,
      totalDfds: 0,
      totalItens: 0,
      valorEstimado: 0,
      criadoPor: criadoPor ?? null,
    })
    .returning({ id: pcas.id });
  return { id: p.id };
}

/** Renomeia/re-ano um PCA (registro ou edição); renova `atualizadoEm`. */
export async function atualizarPca(id: number, dados: EditarPcaPayload): Promise<void> {
  await getDb()
    .update(pcas)
    .set({
      atualizadoEm: sql`(CURRENT_TIMESTAMP)`,
      ...(dados.nome !== undefined ? { nome: dados.nome } : {}),
      ...(dados.ano !== undefined ? { ano: dados.ano } : {}),
    })
    .where(eq(pcas.id, id));
}

/** Marca UM PCA como o vigente (zera os demais numa transação — só 1 ativo). */
export async function definirPcaAtivo(id: number): Promise<void> {
  const db = getDb();
  const stmts = [
    db.update(pcas).set({ ativo: false }),
    db.update(pcas).set({ ativo: true }).where(eq(pcas.id, id)),
  ];
  await db.batch(stmts as [(typeof stmts)[number], ...(typeof stmts)[number][]]);
}
