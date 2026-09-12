import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { dfdItens, dfds, pcaDfds, pcas, reparticoes } from "@/db/schema";
import { getDb } from "./db";
import type { DfdImportPayload, GerarPcaPayload } from "./dfd-validation";

/**
 * Acesso a dados de DFD/PCA. Escopo por REPARTIÇÃO (como as `unidades`): a
 * listagem filtra pela repartição ativa do head (Geral = todas). Edições de PCA
 * são o plano CONSOLIDADO da Prefeitura (globais). Sem `grupo_id`.
 */

// dfd_itens = 9 colunas vinculadas por linha → 11×9 = 99 (< limite de 100 do D1).
const ROWS_PER_STMT = 11;

// biome-ignore lint/suspicious/noExplicitAny: tipos encadeados do query-builder do Drizzle para db.batch() são inviáveis de anotar aqui.
function insertsItens(db: ReturnType<typeof getDb>, dfdId: number, itens: DfdImportPayload["itens"]): any[] {
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
          sequencial: i + j + 1,
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
  secoes: DfdSecaoRow[];
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
};

/** DFDs (opcionalmente filtrados por repartição — Geral passa `undefined`). */
export async function listarDfds(reparticaoId?: number): Promise<DfdResumo[]> {
  return getDb()
    .select(colunasDfd)
    .from(dfds)
    .leftJoin(reparticoes, eq(dfds.reparticaoId, reparticoes.id))
    .where(reparticaoId ? eq(dfds.reparticaoId, reparticaoId) : undefined)
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
      secoes: dfds.secoes,
    })
    .from(dfds)
    .leftJoin(reparticoes, eq(dfds.reparticaoId, reparticoes.id))
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
  return { ...d, secoes: parseSecoes(d.secoes), itens };
}

/** Cria (ou substitui, pelo `numero`) um DFD e seus itens (batch atômico). */
export async function criarOuSubstituirDfd(
  dados: DfdImportPayload,
  criadoPor: number | null,
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
    responsavel: dados.responsavel ?? null,
    matricula: dados.matricula ?? null,
    email: dados.email ?? null,
    telefone: dados.telefone ?? null,
    valorEstimado: dados.valorEstimado ?? null,
    valorTotal: dados.valorTotal ?? null,
    secoes: dados.secoes && dados.secoes.length > 0 ? JSON.stringify(dados.secoes) : null,
    nomeArquivo: dados.nomeArquivo ?? null,
    totalItens: dados.itens.length,
    atualizadoEm: sql`(CURRENT_TIMESTAMP)`,
  };
  const [d] = await db
    .insert(dfds)
    .values({ numero: dados.numero, criadoPor: criadoPor ?? null, ...set })
    .onConflictDoUpdate({ target: dfds.numero, set })
    .returning({ id: dfds.id });

  const id = d.id;
  const stmts = insertsItens(db, id, dados.itens);
  await db.batch([
    db.delete(dfdItens).where(eq(dfdItens.dfdId, id)),
    ...stmts,
  ] as [(typeof stmts)[number], ...(typeof stmts)[number][]]);
  return { id, numero: dados.numero };
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
      totalDfds: pcas.totalDfds,
      totalItens: pcas.totalItens,
      valorEstimado: pcas.valorEstimado,
      criadoEm: pcas.criadoEm,
    })
    .from(pcas)
    .orderBy(desc(pcas.criadoEm), desc(pcas.id));
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
