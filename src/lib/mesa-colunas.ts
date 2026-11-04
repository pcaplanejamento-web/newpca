import { eq } from "drizzle-orm";
import { dfdItens, mesaColunas, mesaColunasValores } from "@/db/schema";
import { getDb } from "./db";
import { type ColunaMesa, type ColunasMesa, COLUNAS_MESA_VAZIAS, ENTIDADES_COLUNA, type EntidadeColuna, MAX_COLUNAS_POR_ENTIDADE } from "./mesa-colunas-core";
import { comandoCriarColuna, comandoNosItens, comandosGravarValores, consultaColunaPorNome } from "./mesa-colunas-sql";

const entidade = (e: string): EntidadeColuna => ((ENTIDADES_COLUNA as readonly string[]).includes(e) ? (e as EntidadeColuna) : "dfd");
const SEL = { id: mesaColunas.id, entidade: mesaColunas.entidade, nome: mesaColunas.nome, nosItens: mesaColunas.nosItens };
const daLinha = (l: { id: number; entidade: string; nome: string; nosItens: number | null }): ColunaMesa => {
  const e = entidade(l.entidade);
  return { id: l.id, entidade: e, nome: l.nome, nosItens: e === "dfd" && l.nosItens === 1 };
};

/** As colunas cadastradas (todas as entidades). */
export async function listarColunasMesa(): Promise<ColunaMesa[]> {
  const ls = await getDb().select(SEL).from(mesaColunas).orderBy(mesaColunas.id);
  return ls.map(daLinha);
}

/**
 * As colunas + os valores das linhas que a pessoa VÊ (protocolos e DFDs pelos ids; itens pelos DFDs visíveis) — a Mesa.
 * Fail-safe: falhou ⇒ sem colunas (a Mesa segue).
 */
export async function colunasDaMesa(visiveis: { protocolos: Set<number>; dfds: Set<number> }): Promise<ColunasMesa> {
  try {
    const colunas = await listarColunasMesa();
    if (!colunas.length) return COLUNAS_MESA_VAZIAS;
    const vs = await getDb()
      .select({ c: mesaColunasValores.colunaId, a: mesaColunasValores.alvoId, v: mesaColunasValores.valor, dfdDoItem: dfdItens.dfdId })
      .from(mesaColunasValores)
      .leftJoin(dfdItens, eq(dfdItens.id, mesaColunasValores.alvoId));
    const entidadeDe = new Map(colunas.map((c) => [c.id, c.entidade]));
    const valores: ColunasMesa["valores"] = {};
    for (const x of vs) {
      const e = entidadeDe.get(x.c);
      const ve = e === "protocolo" ? visiveis.protocolos.has(x.a) : e === "dfd" ? visiveis.dfds.has(x.a) : x.dfdDoItem != null && visiveis.dfds.has(x.dfdDoItem);
      if (!ve) continue;
      valores[x.c] ??= {};
      valores[x.c][x.a] = x.v;
    }
    return { colunas, valores };
  } catch {
    return COLUNAS_MESA_VAZIAS;
  }
}

/**
 * A coluna de nome igual (sem caixa/acento), criada quando ainda não existe. `nosItens` informado (só DFD) grava o
 * "também na tabela de Itens" — na criação e na coluna já existente quando difere. `null` = passou do teto da entidade.
 */
export async function colunaPorNome(
  e: EntidadeColuna,
  nome: string,
  usuarioId: number | null,
  nosItens?: boolean,
): Promise<{ coluna: ColunaMesa; criada: boolean } | null> {
  const achar = async () => {
    const l = (await consultaColunaPorNome(getDb(), e, nome))[0];
    return l ? daLinha(l) : undefined;
  };
  const ja = await achar();
  if (ja) {
    if (e === "dfd" && nosItens != null && ja.nosItens !== nosItens) {
      await comandoNosItens(getDb(), ja.id, nosItens);
      return { coluna: { ...ja, nosItens }, criada: false };
    }
    return { coluna: ja, criada: false };
  }
  const total = (await getDb().select({ id: mesaColunas.id }).from(mesaColunas).where(eq(mesaColunas.entidade, e))).length;
  if (total >= MAX_COLUNAS_POR_ENTIDADE) return null;
  await comandoCriarColuna(getDb(), e, nome, usuarioId, nosItens === true);
  const nova = await achar();
  return nova ? { coluna: nova, criada: true } : null;
}

export async function getColunaMesa(id: number): Promise<ColunaMesa | null> {
  const l = (await getDb().select(SEL).from(mesaColunas).where(eq(mesaColunas.id, id)))[0];
  return l ? daLinha(l) : null;
}

/** Grava os valores (null apaga) num lote atômico. */
export async function gravarValoresColuna(colunaId: number, valores: { alvoId: number; valor: string | null }[]) {
  const cmds = comandosGravarValores(getDb(), colunaId, valores);
  if (cmds.length) await getDb().batch(cmds as [(typeof cmds)[number], ...(typeof cmds)[number][]]);
}

/** Exclui a coluna (os valores saem em cascata). */
export async function excluirColunaMesa(id: number) {
  await getDb().batch([getDb().delete(mesaColunasValores).where(eq(mesaColunasValores.colunaId, id)), getDb().delete(mesaColunas).where(eq(mesaColunas.id, id))]);
}
