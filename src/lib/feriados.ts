import { asc, eq } from "drizzle-orm";
import { feriados } from "@/db/schema";
import { coerceTipoFeriado, type FeriadoCadastro, type TipoFeriado } from "./calendario-core";
import { getDb } from "./db";

/** FERIADOS cadastrados pelo ADM (migração `0047`) — acesso ao D1 (só escopo de request). Os nacionais são calculados
 * em `calendario-core` (`feriadosNacionais`). */

const COLS = { id: feriados.id, data: feriados.data, nome: feriados.nome, tipo: feriados.tipo, anual: feriados.anual };
const paraCadastro = (r: { id: number; data: string; nome: string; tipo: string; anual: boolean }): FeriadoCadastro => ({ ...r, tipo: coerceTipoFeriado(r.tipo) });

/** Todos os cadastrados (poucos — a lista do ADM e o calendário). Falha = lista vazia (o calendário segue sem eles). */
export async function listarFeriados(): Promise<FeriadoCadastro[]> {
  try {
    const l = await getDb().select(COLS).from(feriados).orderBy(asc(feriados.data), asc(feriados.id)).limit(2000);
    return l.map(paraCadastro);
  } catch {
    return [];
  }
}

export async function getFeriado(id: number): Promise<FeriadoCadastro | null> {
  const [r] = await getDb().select(COLS).from(feriados).where(eq(feriados.id, id));
  return r ? paraCadastro(r) : null;
}

export async function criarFeriado(d: { data: string; nome: string; tipo: TipoFeriado; anual: boolean }): Promise<number> {
  const [r] = await getDb().insert(feriados).values(d).returning({ id: feriados.id });
  return r.id;
}

export async function atualizarFeriado(id: number, d: Partial<{ data: string; nome: string; tipo: TipoFeriado; anual: boolean }>) {
  await getDb().update(feriados).set(d).where(eq(feriados.id, id));
}

export async function excluirFeriado(id: number) {
  await getDb().delete(feriados).where(eq(feriados.id, id));
}
