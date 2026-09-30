import { count, eq, inArray } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema.ts";
import {
  grupoReparticoes,
  grupos,
  permissoes,
  reparticoes,
  tarefaModelos,
  tarefaPastas,
  tarefaQuadros,
  usuarioGrupos,
  usuarios,
} from "../db/schema.ts";

/**
 * GRUPOS (administração) — os comandos como BUILDERS do Drizzle, sem getDb (testados pelo driver D1 sobre `node:sqlite`,
 * dentro de `db.batch`): trocar os membros/unidades de um grupo é UM lote (tudo ou nada — antes apagava e regravava fora
 * de transação: um id inválido derrubava o insert DEPOIS de apagar, e o grupo ficava vazio).
 */
type Db = DrizzleD1Database<typeof schema>;

/** Linhas por INSERT de vínculo (2 parâmetros cada — 80 < 100 do D1). */
const LINHAS_POR_INSERT = 40;
/** Ids por consulta `IN (...)` (limite de 100 parâmetros do D1). */
const IDS_POR_CONSULTA = 90;

function lotes<T>(lista: readonly T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < lista.length; i += n) out.push(lista.slice(i, i + n));
  return out;
}

/** Troca as PESSOAS do grupo: apaga os vínculos e grava os novos (para o `db.batch`). */
export function comandosMembros(db: Db, grupoId: number, usuarioIds: readonly number[]) {
  return [
    db.delete(usuarioGrupos).where(eq(usuarioGrupos.grupoId, grupoId)),
    ...lotes([...new Set(usuarioIds)], LINHAS_POR_INSERT).map((l) =>
      db.insert(usuarioGrupos).values(l.map((usuarioId) => ({ usuarioId, grupoId }))),
    ),
  ];
}

/** Troca os GRUPOS de uma pessoa (Usuários → Editar/Aprovar): apaga os vínculos dela e grava os novos (para o
 * `db.batch` — tudo ou nada). */
export function comandosGruposDoUsuario(db: Db, usuarioId: number, grupoIds: readonly number[]) {
  return [
    db.delete(usuarioGrupos).where(eq(usuarioGrupos.usuarioId, usuarioId)),
    ...lotes([...new Set(grupoIds)], LINHAS_POR_INSERT).map((l) =>
      db.insert(usuarioGrupos).values(l.map((grupoId) => ({ usuarioId, grupoId }))),
    ),
  ];
}

/** Troca as UNIDADES do grupo: apaga os vínculos e grava os novos (para o `db.batch`). */
export function comandosUnidades(db: Db, grupoId: number, reparticaoIds: readonly number[]) {
  return [
    db.delete(grupoReparticoes).where(eq(grupoReparticoes.grupoId, grupoId)),
    ...lotes([...new Set(reparticaoIds)], LINHAS_POR_INSERT).map((l) =>
      db.insert(grupoReparticoes).values(l.map((reparticaoId) => ({ grupoId, reparticaoId }))),
    ),
  ];
}

const TABELAS = {
  usuarios: { tabela: usuarios, id: usuarios.id },
  reparticoes: { tabela: reparticoes, id: reparticoes.id },
  permissoes: { tabela: permissoes, id: permissoes.id },
  grupos: { tabela: grupos, id: grupos.id },
} as const;

/** Os ids que NÃO existem (pessoas, unidades, permissão ou grupos) — a rota recusa antes de gravar, com a lista. */
export async function idsInexistentes(db: Db, qual: keyof typeof TABELAS, ids: readonly number[]): Promise<number[]> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return [];
  const { tabela, id } = TABELAS[qual];
  const achados = new Set<number>();
  for (const l of lotes(unicos, IDS_POR_CONSULTA)) {
    for (const r of await db.select({ id }).from(tabela).where(inArray(id, l))) achados.add(r.id);
  }
  return unicos.filter((x) => !achados.has(x));
}

/** Por que o grupo não pode ser gravado (id de pessoa, unidade ou permissão que não existe) — `null` = ok. A rota
 * recusa (422) ANTES de gravar qualquer coisa. */
export async function motivoIdsInvalidos(
  db: Db,
  dados: { permissaoId?: number | null; membros?: readonly number[]; reparticoes?: readonly number[] },
): Promise<string | null> {
  const [semPermissao, semPessoa, semUnidade] = await Promise.all([
    dados.permissaoId != null ? idsInexistentes(db, "permissoes", [dados.permissaoId]) : Promise.resolve([]),
    idsInexistentes(db, "usuarios", dados.membros ?? []),
    idsInexistentes(db, "reparticoes", dados.reparticoes ?? []),
  ]);
  if (semPermissao.length) return "A permissão escolhida não existe mais — recarregue a tela.";
  if (semPessoa.length) return `Pessoa(s) não encontrada(s): ${semPessoa.join(", ")} — recarregue a tela.`;
  if (semUnidade.length) return `Unidade(s) não encontrada(s): ${semUnidade.join(", ")} — recarregue a tela.`;
  return null;
}

/** O que muda ao EXCLUIR o grupo: as pessoas e as unidades perdem o vínculo; os QUADROS de tarefas (com as tarefas),
 * as PASTAS e os MODELOS do grupo são excluídos em cascata. */
export type ImpactoGrupo = { pessoas: number; unidades: number; quadros: number; pastas: number; modelos: number };

export async function impactoDoGrupo(db: Db, grupoId: number): Promise<ImpactoGrupo> {
  const n = async (q: Promise<{ n: number }[]>) => Number((await q)[0]?.n ?? 0);
  const [pessoas, unidades, quadros, pastas, modelos] = await Promise.all([
    n(db.select({ n: count() }).from(usuarioGrupos).where(eq(usuarioGrupos.grupoId, grupoId))),
    n(db.select({ n: count() }).from(grupoReparticoes).where(eq(grupoReparticoes.grupoId, grupoId))),
    n(db.select({ n: count() }).from(tarefaQuadros).where(eq(tarefaQuadros.grupoId, grupoId))),
    n(db.select({ n: count() }).from(tarefaPastas).where(eq(tarefaPastas.grupoId, grupoId))),
    n(db.select({ n: count() }).from(tarefaModelos).where(eq(tarefaModelos.grupoId, grupoId))),
  ]);
  return { pessoas, unidades, quadros, pastas, modelos };
}

/** A exclusão APAGA conteúdo (quadros, pastas, modelos) — só com a confirmação explícita. */
export const apagaConteudo = (i: ImpactoGrupo) => i.quadros + i.pastas + i.modelos > 0;

/** O texto do impacto (confirmação da tela e mensagem do 409). */
export function textoImpactoGrupo(i: ImpactoGrupo): string {
  const partes: string[] = [];
  const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
  if (i.quadros) partes.push(plural(i.quadros, "quadro de tarefas (com as tarefas)", "quadros de tarefas (com as tarefas)"));
  if (i.pastas) partes.push(plural(i.pastas, "pasta", "pastas"));
  if (i.modelos) partes.push(plural(i.modelos, "modelo de quadro", "modelos de quadro"));
  const apaga = partes.length ? `Serão EXCLUÍDOS junto: ${partes.join(", ")}. ` : "";
  const vinculos = `${plural(i.pessoas, "pessoa perde", "pessoas perdem")} o acesso dado por este grupo`;
  return `${apaga}${vinculos}${i.unidades ? ` (${plural(i.unidades, "unidade", "unidades")})` : ""}.`;
}
