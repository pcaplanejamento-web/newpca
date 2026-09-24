import { and, asc, desc, eq, inArray, isNull, ne, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { dfdPassagens, dfdProtocolos, dfds, pcas, reparticoes, usuarios } from "@/db/schema";
import { nomesPessoas, nomesSituacoes, rotulosUnidades } from "./auditoria";
import { classificarAssunto } from "./avaliacao-core";
import type { DetalheAuditoria } from "./auditoria-core";
import { compararCapa } from "./comparar-protocolo";
import { limparRastroDestino } from "./rastro-sql";
import { type DfdResumo, listarDfdsDoProtocolo } from "./dfd";
import type { ProtocoloMetaPayload } from "./dfd-validation";
import { getDb } from "./db";

/**
 * Acesso a dados do PROTOCOLO (o "processo" que empacota vários DFDs). Escopo por
 * REPARTIÇÃO (como `dfds`). Os totais (nº de DFDs, itens, valor) são recompostos
 * AO VIVO a partir dos DFDs vinculados — o vínculo é dinâmico (protocolar,
 * vincular/desvincular, re-importar). Os DFDs são gravados em streaming pelo
 * cliente (`POST /api/dfd`); aqui só se cria/lê/exclui o protocolo.
 */

type ProtocoloMeta = ProtocoloMetaPayload;

export type ProtocoloResumo = {
  id: number;
  numero: string;
  idExterno: string | null;
  anoPca: number | null;
  interessado: string | null;
  assunto: string | null;
  data: string | null;
  valorCapa: number | null;
  reparticaoId: number | null;
  reparticaoCodigo: string | null;
  reparticaoNome: string | null;
  totalDfds: number;
  totalItens: number;
  valorTotal: number;
  /** Data da PROTOCOLAÇÃO (quando entrou no sistema — UTC do SQLite). */
  criadoEm: string | null;
  /** Última gravação de um DFD do protocolo — invalida o cache da conferência agregada (Estado). */
  dfdsAtualizadoEm: string | null;
  // GESTÃO na Mesa: pessoa designada (Responsável), situação (cadastrada pelo ADM) e quem protocolou
  // (Distribuição = `criado_por`). A foto/apelido vêm do diretório de pessoas da Mesa (pelo id).
  responsavelId: number | null;
  responsavelNome: string | null;
  situacaoId: number | null;
  distribuidorId: number | null;
  distribuidorNome: string | null;
  /** DFDs que PASSARAM por aqui e foram sobrescritos por um DFD de OUTRO protocolo (o rastro cinza) — e a
   * soma do valor deles NA ÉPOCA: a capa foi emitida com eles, então entram na conciliação da capa. */
  sobrescritos: number;
  valorSobrescritos: number;
  /** Mesa do PCA (migração `0034`): o PCA para onde foi ENVIADO (`null` = na Mesa principal) e quando foi
   * INCORPORADO (≠ null ⇒ protocolo, DFDs e itens TRAVADOS para edição). */
  pcaId: number | null;
  pcaNome: string | null;
  pcaIncorporadoEm: string | null;
};

/**
 * DFD que PASSOU por um protocolo e foi SOBRESCRITO por um DFD de OUTRO protocolo (mesmo nº) — o rastro
 * mostrado em cinza, separado, com o retrato da versão que o protocolo tinha. O protocolo ATUAL é SEMPRE o
 * do DFD vivo de mesmo nº (o último da cadeia A → B → C: A e B apontam C). DFD excluído depois ⇒ sem ele.
 */
export type DfdSobrescrito = {
  numero: string;
  planejamento: string | null;
  tipo: string | null;
  sigla: string | null;
  totalItens: number | null;
  valorTotal: number | null;
  sobrescritoEm: string | null;
  /** O DFD vivo (mesmo nº) hoje — `null` = excluído depois. */
  dfdId: number | null;
  protocoloAtualId: number | null;
  protocoloAtualNumero: string | null;
  /** Quem vê pode abrir o protocolo atual (unidade no escopo) — senão o link fica desabilitado. */
  acessivel?: boolean;
};

export type ProtocoloDetalhe = ProtocoloResumo & {
  documento: string | null;
  observacao: string | null;
  localReparticao: string | null;
  nomeArquivo: string | null;
  dfds: DfdResumo[];
};

// Valor de um DFD p/ somatório: soma dos itens (zero se sem valores; sem estimativa).
const VALOR_DFD = sql<number>`COALESCE(${dfds.valorTotal}, 0)`;
// Rastro dos DFDs sobrescritos (por protocolo): quantos e o valor deles na época (subconsultas pelo índice).
const colunasSobrescritos = {
  sobrescritos: sql<number>`(SELECT COUNT(*) FROM ${dfdPassagens} WHERE ${dfdPassagens.protocoloId} = ${dfdProtocolos.id})`,
  valorSobrescritos: sql<number>`(SELECT COALESCE(SUM(${dfdPassagens.valorTotal}), 0) FROM ${dfdPassagens} WHERE ${dfdPassagens.protocoloId} = ${dfdProtocolos.id})`,
};

/** Protocolos da MESA PRINCIPAL (os não enviados a um PCA) — opcionalmente filtrados por repartição (Geral
 * passa `undefined`), com totais agregados ao vivo dos DFDs vinculados. */
export async function listarProtocolos(reparticaoId?: number): Promise<ProtocoloResumo[]> {
  return consultaProtocolos(and(isNull(dfdProtocolos.pcaId), reparticaoId ? eq(dfdProtocolos.reparticaoId, reparticaoId) : undefined));
}

/** Protocolos da MESA DO PCA (os enviados a ele), com os mesmos totais ao vivo. */
export async function listarProtocolosDoPca(pcaId: number): Promise<ProtocoloResumo[]> {
  return consultaProtocolos(eq(dfdProtocolos.pcaId, pcaId));
}

/** Protocolos pelos ids (edição em massa — ≤ 20 por requisição), com os mesmos totais ao vivo. */
export async function listarProtocolosPorIds(ids: number[]): Promise<ProtocoloResumo[]> {
  const uniq = [...new Set(ids)].filter((n) => Number.isInteger(n) && n > 0);
  return uniq.length === 0 ? [] : consultaProtocolos(inArray(dfdProtocolos.id, uniq));
}

// Pessoas ligadas ao protocolo (aliases de `usuarios`): o responsável designado e quem protocolou.
const responsavel = alias(usuarios, "responsavel");
const distribuidor = alias(usuarios, "distribuidor");
/** Colunas de GESTÃO (responsável/situação/distribuição) — as mesmas na lista e no detalhe. */
const colunasGestao = {
  responsavelId: dfdProtocolos.responsavelId,
  responsavelNome: responsavel.nome,
  situacaoId: dfdProtocolos.situacaoId,
  distribuidorId: dfdProtocolos.criadoPor,
  distribuidorNome: distribuidor.nome,
  pcaId: dfdProtocolos.pcaId,
  pcaNome: pcas.nome,
  pcaIncorporadoEm: dfdProtocolos.pcaIncorporadoEm,
};

function consultaProtocolos(onde: SQL | undefined): Promise<ProtocoloResumo[]> {
  return getDb()
    .select({
      id: dfdProtocolos.id,
      numero: dfdProtocolos.numero,
      idExterno: dfdProtocolos.idExterno,
      anoPca: dfdProtocolos.anoPca,
      interessado: dfdProtocolos.interessado,
      assunto: dfdProtocolos.assunto,
      data: dfdProtocolos.data,
      valorCapa: dfdProtocolos.valorCapa,
      reparticaoId: dfdProtocolos.reparticaoId,
      reparticaoCodigo: reparticoes.codigo,
      reparticaoNome: reparticoes.nome,
      criadoEm: dfdProtocolos.criadoEm,
      ...colunasGestao,
      ...colunasSobrescritos,
      totalDfds: sql<number>`COUNT(DISTINCT ${dfds.id})`,
      totalItens: sql<number>`COALESCE(SUM(${dfds.totalItens}), 0)`,
      valorTotal: sql<number>`COALESCE(SUM(${VALOR_DFD}), 0)`,
      dfdsAtualizadoEm: sql<string | null>`MAX(${dfds.atualizadoEm})`,
    })
    .from(dfdProtocolos)
    .leftJoin(reparticoes, eq(dfdProtocolos.reparticaoId, reparticoes.id))
    .leftJoin(responsavel, eq(dfdProtocolos.responsavelId, responsavel.id))
    .leftJoin(distribuidor, eq(dfdProtocolos.criadoPor, distribuidor.id))
    .leftJoin(pcas, eq(dfdProtocolos.pcaId, pcas.id))
    .leftJoin(dfds, eq(dfds.protocoloId, dfdProtocolos.id))
    .where(onde)
    .groupBy(dfdProtocolos.id)
    .orderBy(desc(dfdProtocolos.criadoEm), desc(dfdProtocolos.id));
}

/** Protocolo + seus DFDs (resumo). Totais recompostos ao vivo. */
export async function getProtocolo(id: number): Promise<ProtocoloDetalhe | null> {
  const db = getDb();
  const [p] = await db
    .select({
      id: dfdProtocolos.id,
      numero: dfdProtocolos.numero,
      idExterno: dfdProtocolos.idExterno,
      anoPca: dfdProtocolos.anoPca,
      interessado: dfdProtocolos.interessado,
      assunto: dfdProtocolos.assunto,
      data: dfdProtocolos.data,
      valorCapa: dfdProtocolos.valorCapa,
      documento: dfdProtocolos.documento,
      observacao: dfdProtocolos.observacao,
      localReparticao: dfdProtocolos.localReparticao,
      nomeArquivo: dfdProtocolos.nomeArquivo,
      reparticaoId: dfdProtocolos.reparticaoId,
      reparticaoCodigo: reparticoes.codigo,
      reparticaoNome: reparticoes.nome,
      criadoEm: dfdProtocolos.criadoEm,
      ...colunasGestao,
      ...colunasSobrescritos,
    })
    .from(dfdProtocolos)
    .leftJoin(reparticoes, eq(dfdProtocolos.reparticaoId, reparticoes.id))
    .leftJoin(responsavel, eq(dfdProtocolos.responsavelId, responsavel.id))
    .leftJoin(distribuidor, eq(dfdProtocolos.criadoPor, distribuidor.id))
    .leftJoin(pcas, eq(dfdProtocolos.pcaId, pcas.id))
    .where(eq(dfdProtocolos.id, id))
    .limit(1);
  if (!p) return null;

  const dfdsList = await listarDfdsDoProtocolo(id);
  const totalItens = dfdsList.reduce((s, d) => s + (d.totalItens ?? 0), 0);
  const valorTotal = dfdsList.reduce((s, d) => s + (d.valorTotal ?? 0), 0);
  const dfdsAtualizadoEm = dfdsList.reduce<string | null>((m, d) => (d.atualizadoEm && (!m || d.atualizadoEm > m) ? d.atualizadoEm : m), null);
  return { ...p, totalDfds: dfdsList.length, totalItens, valorTotal, dfdsAtualizadoEm, dfds: dfdsList };
}

/** Os DFDs SOBRESCRITOS de um protocolo (o rastro cinza), com o protocolo ATUAL de cada um (o do DFD vivo).
 * `acessivel` (escopo por unidade de quem vê) marca se o protocolo atual pode ser aberto. */
export async function listarSobrescritos(protocoloId: number, acessivel: (reparticaoId: number | null) => boolean = () => true): Promise<DfdSobrescrito[]> {
  const atual = alias(dfdProtocolos, "atual");
  const linhas = await getDb()
    .select({
      numero: dfdPassagens.dfdNumero,
      planejamento: dfdPassagens.planejamento,
      tipo: dfdPassagens.tipo,
      sigla: dfdPassagens.sigla,
      totalItens: dfdPassagens.totalItens,
      valorTotal: dfdPassagens.valorTotal,
      sobrescritoEm: dfdPassagens.criadoEm,
      dfdId: dfds.id,
      protocoloAtualId: dfds.protocoloId,
      protocoloAtualNumero: atual.numero,
      reparticaoAtual: atual.reparticaoId,
    })
    .from(dfdPassagens)
    .leftJoin(dfds, eq(dfds.numero, dfdPassagens.dfdNumero))
    .leftJoin(atual, eq(atual.id, dfds.protocoloId))
    .where(eq(dfdPassagens.protocoloId, protocoloId))
    .orderBy(asc(dfdPassagens.dfdNumero));
  return linhas.map(({ reparticaoAtual, ...s }) => ({ ...s, acessivel: s.protocoloAtualId != null && acessivel(reparticaoAtual) }));
}

/**
 * `start-protocolo`: cria/atualiza (upsert pelo `numero`) só o protocolo a partir
 * da capa e devolve o id. Os DFDs são enviados depois, em streaming, pelo cliente
 * (`POST /api/dfd` com `protocoloId`). Cobre também "novo protocolo vazio".
 */
export async function iniciarProtocolo(
  p: ProtocoloMeta,
  criadoPor: number | null,
  /** Responsável padrão de quem protocola (perfil) — só preenche um protocolo AINDA sem responsável. */
  responsavelPadrao: number | null = null,
): Promise<{ id: number; numero: string }> {
  const db = getDb();
  const set = {
    idExterno: p.idExterno ?? null,
    anoPca: p.anoPca ?? null,
    data: p.data ?? null,
    interessado: p.interessado ?? null,
    documento: p.documento ?? null,
    assunto: p.assunto ?? null,
    observacao: p.observacao ?? null,
    valorCapa: p.valorCapa ?? null,
    reparticaoId: p.reparticaoId ?? null,
    orgaoId: p.orgaoId ?? null,
    localReparticao: p.localReparticao ?? null,
    nomeArquivo: p.nomeArquivo ?? null,
    atualizadoEm: sql`(CURRENT_TIMESTAMP)`,
  };
  // Dedup por Id (regra do usuário): NÃO coexistem dois protocolos com o mesmo `idExterno`
  // (Id da capa) — o novo SOBRESCREVE o de mesmo Id. O upsert por `numero` cobre o mesmo
  // número; aqui removemos um eventual protocolo de MESMO Id e número DIFERENTE (os DFDs
  // dele ficam órfãos por FK `set null`, como em qualquer exclusão de protocolo). O
  // anti-sequestro (Id em unidade inacessível) é conferido na rota antes de chamar.
  if (p.idExterno) {
    await db.delete(dfdProtocolos).where(and(eq(dfdProtocolos.idExterno, p.idExterno), ne(dfdProtocolos.numero, p.numero)));
  }
  const [row] = await db
    .insert(dfdProtocolos)
    .values({ numero: p.numero, criadoPor: criadoPor ?? null, responsavelId: responsavelPadrao, ...set })
    // Sobrescrita (mesmo nº / reenvio): o responsável já designado PERMANECE (a situação e a
    // distribuição também — não estão no `set`).
    .onConflictDoUpdate({ target: dfdProtocolos.numero, set: { ...set, responsavelId: sql`COALESCE(${dfdProtocolos.responsavelId}, ${responsavelPadrao})` } })
    .returning({ id: dfdProtocolos.id });
  return { id: row.id, numero: p.numero };
}

/** Protocolo de mesmo `numero` — anti-sequestro: protocolar SOBRESCREVE a capa do de mesmo nº. */
export async function getProtocoloPorNumero(numero: string): Promise<{ id: number; reparticaoId: number | null } | null> {
  const [r] = await getDb()
    .select({ id: dfdProtocolos.id, reparticaoId: dfdProtocolos.reparticaoId })
    .from(dfdProtocolos)
    .where(eq(dfdProtocolos.numero, numero))
    .limit(1);
  return r ?? null;
}

/** Protocolo de mesmo `idExterno` (Id da capa) — para o anti-sequestro na protocolação. */
export async function getProtocoloPorIdExterno(
  idExterno: string,
): Promise<{ id: number; numero: string; reparticaoId: number | null } | null> {
  const [r] = await getDb()
    .select({ id: dfdProtocolos.id, numero: dfdProtocolos.numero, reparticaoId: dfdProtocolos.reparticaoId })
    .from(dfdProtocolos)
    .where(eq(dfdProtocolos.idExterno, idExterno))
    .limit(1);
  return r ?? null;
}

/**
 * Edita um protocolo JÁ GRAVADO (banner destravado / célula da Mesa). Muda a **repartição**
 * (roteamento), os campos de **CONTEÚDO** da capa (interessado/assunto/observação/CPF-CNPJ/valor/
 * local) e a **GESTÃO** (responsável/situação). Os **IDENTIFICADORES** (número/Id/data/ano do PCA) NÃO
 * estão aqui → imutáveis. Cada campo é opcional; `undefined` = não mexe. Grava direto no D1.
 */
export async function atualizarProtocolo(
  id: number,
  campos: {
    reparticaoId?: number | null;
    interessado?: string | null;
    documento?: string | null;
    assunto?: string | null;
    observacao?: string | null;
    valorCapa?: number | null;
    localReparticao?: string | null;
    responsavelId?: number | null;
    situacaoId?: number | null;
  },
): Promise<void> {
  const set: Record<string, unknown> = { atualizadoEm: sql`(CURRENT_TIMESTAMP)` };
  if (campos.responsavelId !== undefined) set.responsavelId = campos.responsavelId;
  if (campos.situacaoId !== undefined) set.situacaoId = campos.situacaoId;
  if (campos.reparticaoId !== undefined) set.reparticaoId = campos.reparticaoId;
  if (campos.interessado !== undefined) set.interessado = campos.interessado;
  if (campos.documento !== undefined) set.documento = campos.documento;
  if (campos.assunto !== undefined) set.assunto = campos.assunto;
  if (campos.observacao !== undefined) set.observacao = campos.observacao;
  if (campos.valorCapa !== undefined) set.valorCapa = campos.valorCapa;
  if (campos.localReparticao !== undefined) set.localReparticao = campos.localReparticao;
  await getDb().update(dfdProtocolos).set(set).where(eq(dfdProtocolos.id, id));
}

/** O que muda numa edição do protocolo (`atualizarProtocolo`) — o mesmo corpo do PATCH/massa. */
export type CamposProtocolo = Parameters<typeof atualizarProtocolo>[1];

/**
 * DETALHE da edição de um protocolo para o HISTÓRICO: a capa (a MESMA régua do reenvio, `compararCapa`)
 * + responsável e situação — antes → depois, com rótulos legíveis gravados (sigla da unidade, nome da
 * pessoa/situação), que sobrevivem a renomear/excluir depois.
 */
export async function detalheEdicaoProtocolo(
  antes: ProtocoloDetalhe | ProtocoloResumo,
  // O REENVIO também traz a data e o ano do PCA da capa nova (o PATCH não — são identificadores).
  campos: CamposProtocolo & { data?: string | null; anoPca?: number | null },
): Promise<DetalheAuditoria> {
  const def = <T,>(v: T | undefined, atual: T) => (v === undefined ? atual : v);
  const capa = (p: Partial<CamposProtocolo> & { data?: string | null; anoPca?: number | null }, base: ProtocoloDetalhe | ProtocoloResumo) => ({
    data: def(p.data, base.data),
    anoPca: def(p.anoPca, base.anoPca),
    interessado: def(p.interessado, base.interessado),
    documento: def(p.documento, "documento" in base ? base.documento : null),
    assunto: def(p.assunto, base.assunto),
    observacao: def(p.observacao, "observacao" in base ? base.observacao : null),
    valorCapa: def(p.valorCapa, base.valorCapa),
    localReparticao: def(p.localReparticao, "localReparticao" in base ? base.localReparticao : null),
    reparticaoId: def(p.reparticaoId, base.reparticaoId),
  });
  // Só consulta as siglas quando a unidade muda de fato (a massa roda isto por protocolo).
  const mudaUnidade = campos.reparticaoId !== undefined && campos.reparticaoId !== antes.reparticaoId;
  const rotuloUnidade = mudaUnidade ? await rotulosUnidades([antes.reparticaoId, campos.reparticaoId]) : undefined;
  const out = compararCapa(capa({}, antes), capa(campos, antes), rotuloUnidade);
  if (campos.responsavelId !== undefined && campos.responsavelId !== antes.responsavelId) {
    const nome = await nomesPessoas([antes.responsavelId, campos.responsavelId]);
    out.push({ campo: "responsavelId", rotulo: "Responsável", antes: nome(antes.responsavelId), depois: nome(campos.responsavelId) });
  }
  if (campos.situacaoId !== undefined && campos.situacaoId !== antes.situacaoId) {
    const nome = await nomesSituacoes([antes.situacaoId, campos.situacaoId]);
    out.push({ campo: "situacaoId", rotulo: "Situação", antes: nome(antes.situacaoId), depois: nome(campos.situacaoId) });
  }
  return { campos: out };
}

/** Vincula (ou desvincula, com `null`) um DFD a um protocolo — rule 4. Vinculado a um protocolo, o DFD
 * volta a estar VIVO nele: um rastro antigo dele ali ("sobrescrito") sai no mesmo lote. */
export async function vincularDfd(dfdId: number, protocoloId: number | null, numero: string): Promise<void> {
  const db = getDb();
  const vinculo = db.update(dfds).set({ protocoloId, atualizadoEm: sql`(CURRENT_TIMESTAMP)` }).where(eq(dfds.id, dfdId));
  if (protocoloId == null) {
    await vinculo;
    return;
  }
  await db.batch([vinculo, limparRastroDestino(db, numero, protocoloId)]);
}

/** Repartição (+ nº, p/ o histórico, e o assunto — a CATEGORIA das exceções do ADM) de um protocolo — o guard de
 * acesso nas escritas; `null` se não existe. */
export async function getProtocoloReparticao(
  id: number,
): Promise<{ reparticaoId: number | null; numero: string; assunto: string | null } | null> {
  const [r] = await getDb()
    .select({ reparticaoId: dfdProtocolos.reparticaoId, numero: dfdProtocolos.numero, assunto: dfdProtocolos.assunto })
    .from(dfdProtocolos)
    .where(eq(dfdProtocolos.id, id))
    .limit(1);
  return r ?? null;
}

/** CATEGORIA (INCLUSÃO/EXCLUSÃO/ALTERAÇÃO NÃO ONEROSA) do protocolo pelo assunto — o servidor aplica as exceções do
 * ADM por categoria como a análise (senão barraria na gravação o que a análise liberou); sem protocolo = `null`. */
export async function categoriaDoProtocolo(id: number | null | undefined): Promise<string | null> {
  if (id == null) return null;
  return classificarAssunto((await getProtocoloReparticao(id))?.assunto ?? null);
}

/**
 * Exclui o protocolo EM CASCATA: apaga os DFDs vinculados (→ itens via `dfd_itens.dfdId`
 * cascade; e os remove de qualquer edição de PCA via `pca_dfds.dfdId` cascade) e então o
 * protocolo. Ordem importa: apagar os DFDs ANTES (senão a FK `set null` os deixaria órfãos).
 */
export async function excluirProtocolo(id: number): Promise<void> {
  const db = getDb();
  const stmts = [
    db.delete(dfds).where(eq(dfds.protocoloId, id)),
    db.delete(dfdProtocolos).where(eq(dfdProtocolos.id, id)),
  ];
  await db.batch(stmts as [(typeof stmts)[number], ...(typeof stmts)[number][]]);
}
