import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { cache } from "react";
import { centiLotes, empenhos, liquidacoes, pagamentos, reparticoes } from "@/db/schema";
import { type AlteracaoCenti, alteracoesDoRegistro } from "./centi-alteracoes-core";
import { consultaAlteracoes } from "./centi-alteracoes-sql";
import { getDb } from "./db";
import { type ExecucaoEmpenho, LIMITE_EXECUCAO, semRepetir } from "./execucao-empenho-core";
import { type AnoEmpenhos, chaveEscopoEmpenhos, type EscopoEmpenhos } from "./empenhos-tela-core";
import { consultaAnosEmpenhos, consultaVersaoEmpenhos, textoPacoteEmpenhos } from "./empenhos-tela-sql";
import { unidadeDoModulo } from "./escopo-cabecalho";
import { consultaVersaoExecucao } from "./execucao-sql";
import { anosLiquidacoes, textoLiquidacoes } from "./liquidacoes-tela";
import { criarMemoVersao } from "./memo-versao-core";
import { anosPagamentos, textoPagamentos } from "./pagamentos-tela";

/**
 * A TABELA de um CARD de empenhos no D1. O pacote de um ano (~2,4 MB para 21 mil empenhos) fica na MEMÓRIA do Worker enquanto a
 * versão do ano (a última importação promovida do card e a data dos vínculos dele) for a mesma — cada leitura completa percorre o ano inteiro; abrir a tela
 * de novo sem importação nova não lê nada além da versão.
 */
const memo = criarMemoVersao({ max: 12, ttlMs: 2 * 60 * 60_000, agora: () => Date.now() });
/** Os ANOS de cada tabela (a página e o "Todos os anos" os pedem a cada abertura e a cada versão nova). */
const memoAnos = criarMemoVersao({ max: 24, ttlMs: 2 * 60 * 60_000, agora: () => Date.now() });

/**
 * O ESCOPO dos empenhos da pessoa (por requisição): a unidade do cabeçalho — ou as unidades que ela acessa, com Empenhos
 * fora do "Filtro da unidade" — e os ÓRGÃOS dessas unidades (para o empenho vinculado só ao órgão). `null` = todos.
 */
export const escopoDosEmpenhos = cache(async (): Promise<EscopoEmpenhos> => {
  const { id } = await unidadeDoModulo("empenhos");
  if (id === null) return null;
  if (id === false) return { unidades: [], orgaos: [] };
  const ids = typeof id === "number" ? [id] : [...id];
  if (!ids.length) return { unidades: [], orgaos: [] };
  const l = await getDb()
    .select({ id: reparticoes.id, orgaoId: reparticoes.orgaoId })
    .from(reparticoes)
    .where(inArray(reparticoes.id, ids.slice(0, 90)));
  return { unidades: l.map((r) => r.id), orgaos: [...new Set(l.map((r) => r.orgaoId).filter((o): o is number => o != null))] };
});

/** Os anos do card — `null` = de TODOS os cards de empenhos (a tabela única da tela). */
export async function anosEmpenhos(card: number | null, escopo: EscopoEmpenhos): Promise<AnoEmpenhos[]> {
  const db = getDb();
  const ver = await consultaVersaoExecucao(db);
  return memoAnos.obter(`empenhos:${card ?? "todos"}:${chaveEscopoEmpenhos(escopo)}`, ver, () => consultaAnosEmpenhos(db, card, escopo));
}

/** Os anos de liquidações/pagamentos (card ou todos) — na memória enquanto a versão da execução for a mesma. */
export async function anosTabelaExecucao(tipo: "liquidacoes" | "pagamentos", card: number | null, escopo: EscopoEmpenhos): Promise<{ ano: number; n: number }[]> {
  const db = getDb();
  const ver = await consultaVersaoExecucao(db);
  return memoAnos.obter(`${tipo}:${card ?? "todos"}:${chaveEscopoEmpenhos(escopo)}`, ver, () =>
    tipo === "liquidacoes" ? anosLiquidacoes(card, escopo, db) : anosPagamentos(card, escopo, db),
  );
}

/** O pacote do ano do card (`null` = todos os cards, sem repetir o empenho) como TEXTO JSON; `null` quando uma importação concluída no meio impediu uma leitura consistente. */
export async function pacoteEmpenhos(card: number | null, ano: number, removidos: boolean, escopo: EscopoEmpenhos): Promise<string | null> {
  const db = getDb();
  const ver = await consultaVersaoEmpenhos(db, card, ano);
  try {
    return await memo.obter(`${card ?? "todos"}:${ano}:${removidos ? 1 : 0}:${chaveEscopoEmpenhos(escopo)}`, ver, async () => {
      const t = await textoPacoteEmpenhos(db, card, ano, removidos, escopo);
      if (t == null) throw new Error("Os empenhos mudaram durante a leitura.");
      return t;
    });
  } catch {
    return null;
  }
}

/**
 * As LIQUIDAÇÕES/PAGAMENTOS de um ano (card ou todos) como TEXTO JSON — na MEMÓRIA do Worker enquanto a versão da EXECUÇÃO
 * (a última importação promovida de qualquer card + vínculos + cards — a unidade na tela vem do empenho) for a mesma: abrir a
 * tela de novo, ou o "Todos os anos" relendo depois de uma importação, não lê de novo o que não mudou (a cota diária de
 * leituras do D1).
 */
const memoExecucao = criarMemoVersao({ max: 16, ttlMs: 2 * 60 * 60_000, agora: () => Date.now() });
export async function textoTabelaExecucao(
  tipo: "liquidacoes" | "pagamentos",
  card: number | null,
  ano: number,
  removidos: boolean,
  escopo: EscopoEmpenhos,
): Promise<string> {
  const db = getDb();
  const ver = await consultaVersaoExecucao(db);
  return memoExecucao.obter(`${tipo}:${card ?? "todos"}:${ano}:${removidos ? 1 : 0}:${chaveEscopoEmpenhos(escopo)}`, ver, () =>
    tipo === "liquidacoes" ? textoLiquidacoes(card, ano, removidos, escopo, db) : textoPagamentos(card, ano, removidos, escopo, db),
  );
}

export type EmpenhoCompleto = Omit<typeof empenhos.$inferSelect, "hash"> & { loteEstado: string | null; loteConcluidoEm: string | null; alteracoes: AlteracaoCenti[] };

/** Um empenho com TUDO (o histórico, a importação que o gravou, o leitor, criado/atualizado/removido). */
export async function empenhoCompleto(id: number): Promise<EmpenhoCompleto | null> {
  const db = getDb();
  const [e] = await db
    .select()
    .from(empenhos)
    .leftJoin(centiLotes, eq(centiLotes.id, empenhos.loteId))
    .where(eq(empenhos.id, id))
    .limit(1);
  if (!e) return null;
  const { hash: _, ...emp } = e.empenhos;
  return { ...emp, loteEstado: e.centi_lotes?.estado ?? null, loteConcluidoEm: e.centi_lotes?.concluidoEm ?? null, alteracoes: alteracoesDoRegistro(await consultaAlteracoes(db, "empenho", id)) };
}

/**
 * A EXECUÇÃO do empenho: as liquidações e os pagamentos VIGENTES ligados pelo número (de qualquer card e ano; o mesmo
 * registro em dois cards uma vez), da data MAIS RECENTE à mais antiga. `liq`/`pag` = a pessoa vê a tela (senão `null` — a lista nem é lida).
 */
export async function execucaoDoEmpenho(numero: string, ver: { liq: boolean; pag: boolean }): Promise<ExecucaoEmpenho> {
  const db = getDb();
  const [liqs, pags] = await Promise.all([
    ver.liq
      ? db
          .select({
            id: liquidacoes.id,
            chave: liquidacoes.chave,
            cardId: liquidacoes.cardId,
            ano: liquidacoes.ano,
            numero: liquidacoes.numero,
            data: liquidacoes.data,
            valor: liquidacoes.valor,
            valorAnulado: liquidacoes.valorAnulado,
            valorLiquido: liquidacoes.valorLiquido,
            valorPago: liquidacoes.valorPago,
          })
          .from(liquidacoes)
          .where(and(eq(liquidacoes.numeroEmpenho, numero), isNull(liquidacoes.removidoEm)))
          .orderBy(desc(liquidacoes.data), desc(liquidacoes.id))
          .limit(LIMITE_EXECUCAO * 2)
      : null,
    ver.pag
      ? db
          .select({
            id: pagamentos.id,
            chave: pagamentos.chave,
            cardId: pagamentos.cardId,
            ano: pagamentos.ano,
            srcId: pagamentos.srcId,
            data: pagamentos.data,
            valor: pagamentos.valor,
            valorRetencao: pagamentos.valorRetencao,
            valorLiquido: pagamentos.valorLiquido,
            anulado: pagamentos.anulado,
          })
          .from(pagamentos)
          .where(and(eq(pagamentos.numeroEmpenho, numero), isNull(pagamentos.removidoEm)))
          .orderBy(desc(pagamentos.data), desc(pagamentos.id))
          .limit(LIMITE_EXECUCAO * 2)
      : null,
  ]);
  return {
    liquidacoes: liqs ? semRepetir(liqs).slice(0, LIMITE_EXECUCAO) : null,
    pagamentos: pags ? semRepetir(pags.map((p) => ({ ...p, anulado: p.anulado === 1 }))).slice(0, LIMITE_EXECUCAO) : null,
    limite: LIMITE_EXECUCAO,
  };
}
