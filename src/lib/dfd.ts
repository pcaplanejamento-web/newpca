import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { dfdItens, dfdProtocolos, dfds, pcaDfds, pcas, reparticoes } from "@/db/schema";
import { getDb } from "./db";
import type {
  CadastrarPcaPayload,
  DfdItemPayload,
  DfdMetaPayload,
  EditarPcaPayload,
  GerarPcaPayload,
} from "./dfd-validation";
import type { Assinatura } from "./parse-dfd-comum";

/**
 * Acesso a dados de DFD/PCA. Escopo por REPARTIÇÃO (como as `unidades`): a
 * listagem filtra pela repartição ativa do head (Geral = todas). Edições de PCA
 * são o plano CONSOLIDADO da Prefeitura (globais). Sem `grupo_id`.
 */

// dfd_itens = 9 colunas vinculadas por linha → 11×9 = 99 (< limite de 100 do D1).
const ROWS_PER_STMT = 11;

// biome-ignore lint/suspicious/noExplicitAny: tipos encadeados do query-builder do Drizzle para db.batch() são inviáveis de anotar aqui.
function insertsItens(db: ReturnType<typeof getDb>, dfdId: number, itens: DfdItemPayload[], seqBase = 0): any[] {
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
  valorEstimado: number | null;
  valorTotal: number | null;
  totalItens: number | null;
  atualizadoEm: string | null;
  reparticaoId: number | null;
  reparticaoCodigo: string | null;
  reparticaoNome: string | null;
  protocoloId: number | null;
  protocoloNumero: string | null;
  // Referências de renovação (DFD-R) — para sinalizar ATENÇÃO nas listas sem abrir o DFD.
  numeroContrato: string | null;
  numeroAta: string | null;
  numeroLicitacao: string | null;
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

export type DfdDetalhe = DfdResumo & {
  orgaoEntidade: string | null;
  matricula: string | null;
  email: string | null;
  telefone: string | null;
  anoPca: number | null;
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
        fonte: a.fonte === "sistema" ? ("sistema" as const) : ("certificado" as const),
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
  valorEstimado: dfds.valorEstimado,
  valorTotal: dfds.valorTotal,
  totalItens: dfds.totalItens,
  atualizadoEm: dfds.atualizadoEm,
  reparticaoId: dfds.reparticaoId,
  reparticaoCodigo: reparticoes.codigo,
  reparticaoNome: reparticoes.nome,
  protocoloId: dfds.protocoloId,
  protocoloNumero: dfdProtocolos.numero,
  numeroContrato: dfds.numeroContrato,
  numeroAta: dfds.numeroAta,
  numeroLicitacao: dfds.numeroLicitacao,
};

/** DFDs (opcionalmente filtrados por repartição — Geral passa `undefined`). */
export async function listarDfds(reparticaoId?: number): Promise<DfdResumo[]> {
  return getDb()
    .select(colunasDfd)
    .from(dfds)
    .leftJoin(reparticoes, eq(dfds.reparticaoId, reparticoes.id))
    .leftJoin(dfdProtocolos, eq(dfds.protocoloId, dfdProtocolos.id))
    .where(reparticaoId ? eq(dfds.reparticaoId, reparticaoId) : undefined)
    .orderBy(asc(reparticoes.ordem), asc(dfds.numero));
}

/** DFDs vinculados a um protocolo (detalhe do protocolo). Reusa `colunasDfd`. */
export async function listarDfdsDoProtocolo(protocoloId: number): Promise<DfdResumo[]> {
  return getDb()
    .select(colunasDfd)
    .from(dfds)
    .leftJoin(reparticoes, eq(dfds.reparticaoId, reparticoes.id))
    .leftJoin(dfdProtocolos, eq(dfds.protocoloId, dfdProtocolos.id))
    .where(eq(dfds.protocoloId, protocoloId))
    .orderBy(asc(reparticoes.ordem), asc(dfds.numero));
}

export async function getDfd(id: number): Promise<DfdDetalhe | null> {
  const db = getDb();
  const [d] = await db
    .select({
      ...colunasDfd,
      orgaoEntidade: dfds.orgaoEntidade,
      matricula: dfds.matricula,
      email: dfds.email,
      telefone: dfds.telefone,
      anoPca: dfds.anoPca,
      secoes: dfds.secoes,
      assinaturas: dfds.assinaturas,
    })
    .from(dfds)
    .leftJoin(reparticoes, eq(dfds.reparticaoId, reparticoes.id))
    .leftJoin(dfdProtocolos, eq(dfds.protocoloId, dfdProtocolos.id))
    .where(eq(dfds.id, id))
    .limit(1);
  if (!d) return null;
  const itens = await db
    .select({
      id: dfdItens.id,
      item: dfdItens.item,
      codigo: dfdItens.codigo,
      descricao: dfdItens.descricao,
      unidade: dfdItens.unidade,
      quantidade: dfdItens.quantidade,
      valorUnitario: dfdItens.valorUnitario,
      valorTotal: dfdItens.valorTotal,
    })
    .from(dfdItens)
    .where(eq(dfdItens.dfdId, id))
    .orderBy(asc(dfdItens.sequencial));
  return { ...d, secoes: parseSecoes(d.secoes), assinaturas: parseAssinaturas(d.assinaturas), itens };
}

/**
 * `start-dfd`: cria (ou substitui, pelo `numero`) o CABEÇALHO do DFD, **apaga os
 * itens antigos** e grava o 1º lote — tudo num `db.batch` atômico. `totalItens`
 * é o total DECLARADO (o cliente envia os itens em lotes via `appendDfdItens`).
 * Retomável: reexecutar zera e regrava. Base do import de 1 DFD e do protocolo.
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
    protocoloId: dados.protocoloId ?? null,
    responsavel: dados.responsavel ?? null,
    matricula: dados.matricula ?? null,
    email: dados.email ?? null,
    telefone: dados.telefone ?? null,
    anoPca: dados.anoPca ?? null,
    numeroContrato: dados.numeroContrato ?? null,
    numeroAta: dados.numeroAta ?? null,
    numeroLicitacao: dados.numeroLicitacao ?? null,
    valorEstimado: dados.valorEstimado ?? null,
    valorTotal: dados.valorTotal ?? null,
    secoes: dados.secoes && dados.secoes.length > 0 ? JSON.stringify(dados.secoes) : null,
    assinaturas: dados.assinaturas && dados.assinaturas.length > 0 ? JSON.stringify(dados.assinaturas) : null,
    nomeArquivo: dados.nomeArquivo ?? null,
    totalItens: dados.totalItens ?? primeiroLote.length,
    atualizadoEm: sql`(CURRENT_TIMESTAMP)`,
  };
  const [d] = await db
    .insert(dfds)
    .values({ numero: dados.numero, criadoPor: criadoPor ?? null, ...set })
    .onConflictDoUpdate({ target: dfds.numero, set })
    .returning({ id: dfds.id });

  const id = d.id;
  const stmts = insertsItens(db, id, primeiroLote, 0);
  await db.batch([
    db.delete(dfdItens).where(eq(dfdItens.dfdId, id)),
    ...stmts,
  ] as [(typeof stmts)[number], ...(typeof stmts)[number][]]);
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
 * Edita campos de um DFD JÁ GRAVADO (banner destravado): repartição, seções (tratamento),
 * refs de renovação e o **CONTEÚDO do cabeçalho** (objeto/órgão/setor/responsável/matrícula/
 * e-mail/telefone). Os **IDENTIFICADORES** (número/planejamento/tipo) NÃO estão aqui →
 * imutáveis. Não toca nos itens. Grava direto no D1 (`atualizadoEm` renovado).
 */
export async function atualizarDfdCampos(
  id: number,
  campos: {
    reparticaoId?: number | null;
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
  if (campos.reparticaoId !== undefined) set.reparticaoId = campos.reparticaoId;
  if (campos.secoes !== undefined) set.secoes = campos.secoes.length > 0 ? JSON.stringify(campos.secoes) : null;
  if (campos.numeroContrato !== undefined) set.numeroContrato = campos.numeroContrato || null;
  if (campos.numeroAta !== undefined) set.numeroAta = campos.numeroAta || null;
  if (campos.numeroLicitacao !== undefined) set.numeroLicitacao = campos.numeroLicitacao || null;
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
): Promise<{ reparticaoId: number | null; tipo: string | null } | null> {
  const [r] = await getDb()
    .select({ reparticaoId: dfds.reparticaoId, tipo: dfds.tipo })
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

/** Repartição do DFD com esse `numero` (anti-sequestro no `start-dfd`); `null` se não existe. */
export async function getReparticaoDfdNumero(numero: string): Promise<{ reparticaoId: number | null } | null> {
  const [r] = await getDb()
    .select({ reparticaoId: dfds.reparticaoId })
    .from(dfds)
    .where(eq(dfds.numero, numero))
    .limit(1);
  return r ?? null;
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
};

export type PcaDfdBloco = {
  id: number;
  numero: string;
  objeto: string | null;
  setorRequisitante: string | null;
  valorEstimado: number | null;
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

export async function listarPcas(): Promise<PcaResumo[]> {
  return getDb()
    .select({
      id: pcas.id,
      nome: pcas.nome,
      ano: pcas.ano,
      ativo: pcas.ativo,
      totalDfds: pcas.totalDfds,
      totalItens: pcas.totalItens,
      valorEstimado: pcas.valorEstimado,
      criadoEm: pcas.criadoEm,
    })
    .from(pcas)
    .orderBy(desc(pcas.ativo), desc(pcas.criadoEm), desc(pcas.id));
}

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
      valorEstimado: dfds.valorEstimado,
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
      valorEstimado: l.valorEstimado,
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
  const encontrados = await db
    .select({ id: dfds.id, valorEstimado: dfds.valorEstimado, totalItens: dfds.totalItens })
    .from(dfds)
    .where(inArray(dfds.id, uniq));
  if (encontrados.length !== uniq.length) {
    return { erro: "Alguns DFDs selecionados não existem mais. Recarregue e tente de novo." };
  }
  const totalItens = encontrados.reduce((s, d) => s + (d.totalItens ?? 0), 0);
  const valorEstimado = encontrados.reduce((s, d) => s + (d.valorEstimado ?? 0), 0);

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

export async function excluirPca(id: number): Promise<void> {
  await getDb().delete(pcas).where(eq(pcas.id, id)); // cascade apaga pca_dfds
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
  const campos: Partial<typeof pcas.$inferInsert> = { atualizadoEm: sql`(CURRENT_TIMESTAMP)` };
  if (dados.nome !== undefined) campos.nome = dados.nome;
  if (dados.ano !== undefined) campos.ano = dados.ano;
  await getDb().update(pcas).set(campos).where(eq(pcas.id, id));
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
