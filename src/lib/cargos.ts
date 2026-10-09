import { asc, eq, sql } from "drizzle-orm";
import { cargos, responsaveis, responsaveisVinculos, usuarios } from "@/db/schema";
import { getDb } from "./db";

/**
 * CARGOS E FUNÇÕES (Configurações → Cargos e funções, ou Usuários → Cargos e funções; só o ADM): a lista que o cadastro
 * dos usuários e a planilha dos RESPONSÁVEIS oferecem. Cada um guarda o NOME (`usuarios.cargo`, `responsaveis.cargo` e o
 * cargo do temporário — `responsaveis_vinculos.funcao`): RENOMEAR renomeia todos no MESMO lote; EXCLUIR não mexe neles (o
 * cargo segue até o ADM trocar — o aviso diz quantos). Nome único sem caixa.
 */

export type Cargo = { id: number; nome: string; ordem: number };
/** `emUso` = usuários com o cargo; `responsaveis` = pessoas da planilha + temporários com ele. */
export type CargoComUso = Cargo & { emUso: number; responsaveis: number };

const COLS = { id: cargos.id, nome: cargos.nome, ordem: cargos.ordem };
/** Espaços repetidos viram um só (o nome como aparece). */
export const normalizarCargo = (nome: string) => nome.trim().replace(/\s+/g, " ");

export async function listarCargos(): Promise<Cargo[]> {
  return getDb().select(COLS).from(cargos).orderBy(asc(cargos.ordem), asc(cargos.nome));
}

export async function listarCargosComUso(): Promise<CargoComUso[]> {
  const db = getDb();
  const [lista, usos, pessoas, temps] = await Promise.all([
    listarCargos(),
    db
      .select({ nome: sql<string>`lower(${usuarios.cargo})`, n: sql<number>`COUNT(*)` })
      .from(usuarios)
      .where(sql`${usuarios.cargo} IS NOT NULL`)
      .groupBy(sql`lower(${usuarios.cargo})`),
    db
      .select({ nome: sql<string>`lower(${responsaveis.cargo})`, n: sql<number>`COUNT(*)` })
      .from(responsaveis)
      .where(sql`${responsaveis.cargo} <> ''`)
      .groupBy(sql`lower(${responsaveis.cargo})`),
    db
      .select({ nome: sql<string>`lower(${responsaveisVinculos.funcao})`, n: sql<number>`COUNT(*)` })
      .from(responsaveisVinculos)
      .where(sql`${responsaveisVinculos.funcao} <> ''`)
      .groupBy(sql`lower(${responsaveisVinculos.funcao})`),
  ]);
  const mapa = (l: { nome: string; n: number }[]) => new Map(l.map((u) => [u.nome, Number(u.n)]));
  const [porUsuario, porPessoa, porTemp] = [mapa(usos), mapa(pessoas), mapa(temps)];
  return lista.map((c) => {
    const k = c.nome.toLowerCase();
    return { ...c, emUso: porUsuario.get(k) ?? 0, responsaveis: (porPessoa.get(k) ?? 0) + (porTemp.get(k) ?? 0) };
  });
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

/** Renomeia o cargo E o dos usuários, das pessoas da planilha e dos temporários que o têm — num lote atômico. Devolve
 * quantos foram renomeados. */
export async function renomearCargo(antes: Cargo, nome: string): Promise<number> {
  const db = getDb();
  const novo = normalizarCargo(nome);
  const [, us, ps, ts] = await db.batch([
    db.update(cargos).set({ nome: novo, atualizadoEm: sql`(CURRENT_TIMESTAMP)` }).where(eq(cargos.id, antes.id)),
    db
      .update(usuarios)
      .set({ cargo: novo, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
      .where(sql`lower(${usuarios.cargo}) = lower(${antes.nome})`)
      .returning({ id: usuarios.id }),
    db
      .update(responsaveis)
      .set({ cargo: novo, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
      .where(sql`lower(${responsaveis.cargo}) = lower(${antes.nome})`)
      .returning({ id: responsaveis.id }),
    db
      .update(responsaveisVinculos)
      .set({ funcao: novo })
      .where(sql`lower(${responsaveisVinculos.funcao}) = lower(${antes.nome})`)
      .returning({ id: responsaveisVinculos.id }),
  ]);
  return us.length + ps.length + ts.length;
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
