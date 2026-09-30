import { asc, eq, sql } from "drizzle-orm";
import { cargos, usuarios } from "@/db/schema";
import { getDb } from "./db";

/**
 * CARGOS E FUNÇÕES (Usuários → Cargos e funções, só o ADM): a lista que o cadastro oferece. A pessoa guarda o NOME
 * (`usuarios.cargo`): RENOMEAR renomeia o das pessoas no MESMO lote; EXCLUIR não mexe nelas (o cargo segue na pessoa até o
 * ADM trocar — o aviso diz quantas). Nome único sem caixa.
 */

export type Cargo = { id: number; nome: string; ordem: number };
export type CargoComUso = Cargo & { emUso: number };

const COLS = { id: cargos.id, nome: cargos.nome, ordem: cargos.ordem };
/** Espaços repetidos viram um só (o nome como aparece). */
export const normalizarCargo = (nome: string) => nome.trim().replace(/\s+/g, " ");

export async function listarCargos(): Promise<Cargo[]> {
  return getDb().select(COLS).from(cargos).orderBy(asc(cargos.ordem), asc(cargos.nome));
}

export async function listarCargosComUso(): Promise<CargoComUso[]> {
  const db = getDb();
  const [lista, usos] = await Promise.all([
    listarCargos(),
    db
      .select({ nome: sql<string>`lower(${usuarios.cargo})`, n: sql<number>`COUNT(*)` })
      .from(usuarios)
      .where(sql`${usuarios.cargo} IS NOT NULL`)
      .groupBy(sql`lower(${usuarios.cargo})`),
  ]);
  const porNome = new Map(usos.map((u) => [u.nome, Number(u.n)]));
  return lista.map((c) => ({ ...c, emUso: porNome.get(c.nome.toLowerCase()) ?? 0 }));
}

export async function getCargo(id: number): Promise<Cargo | null> {
  const [c] = await getDb().select(COLS).from(cargos).where(eq(cargos.id, id)).limit(1);
  return c ?? null;
}

/** O cargo CADASTRADO com esse nome (sem caixa) — o nome como está no cadastro — ou `null`. */
export async function cargoCadastrado(nome: string): Promise<string | null> {
  const n = normalizarCargo(nome);
  if (!n) return null;
  const [c] = await getDb().select({ nome: cargos.nome }).from(cargos).where(sql`lower(${cargos.nome}) = lower(${n})`).limit(1);
  return c?.nome ?? null;
}

/** Outro cargo (≠ `id`) já usa esse nome? */
export async function nomeCargoEmUso(nome: string, id?: number): Promise<boolean> {
  const [c] = await getDb()
    .select({ id: cargos.id })
    .from(cargos)
    .where(sql`lower(${cargos.nome}) = lower(${normalizarCargo(nome)})${id ? sql` AND ${cargos.id} <> ${id}` : sql``}`)
    .limit(1);
  return !!c;
}

/** Cria no FIM da ordem. */
export async function criarCargo(nome: string): Promise<{ id: number }> {
  const db = getDb();
  const [{ max }] = await db.select({ max: sql<number>`COALESCE(MAX(${cargos.ordem}), -1)` }).from(cargos);
  const [row] = await db.insert(cargos).values({ nome: normalizarCargo(nome), ordem: Number(max) + 1 }).returning({ id: cargos.id });
  return { id: row.id };
}

/** Renomeia o cargo E o das pessoas que o têm — num lote atômico. Devolve quantas pessoas foram renomeadas. */
export async function renomearCargo(antes: Cargo, nome: string): Promise<number> {
  const db = getDb();
  const novo = normalizarCargo(nome);
  const [, pessoas] = await db.batch([
    db.update(cargos).set({ nome: novo, atualizadoEm: sql`(CURRENT_TIMESTAMP)` }).where(eq(cargos.id, antes.id)),
    db
      .update(usuarios)
      .set({ cargo: novo, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
      .where(sql`lower(${usuarios.cargo}) = lower(${antes.nome})`)
      .returning({ id: usuarios.id }),
  ]);
  return pessoas.length;
}

export async function excluirCargo(id: number): Promise<void> {
  await getDb().delete(cargos).where(eq(cargos.id, id));
}

/** Nova ordem (índice = posição na lista). */
export async function reordenarCargos(ids: number[]): Promise<void> {
  const db = getDb();
  if (ids.length === 0) return;
  const stmts = ids.map((id, i) => db.update(cargos).set({ ordem: i, atualizadoEm: sql`(CURRENT_TIMESTAMP)` }).where(eq(cargos.id, id)));
  await db.batch(stmts as [(typeof stmts)[number], ...(typeof stmts)[number][]]);
}
