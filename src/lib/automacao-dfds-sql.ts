import { and, isNotNull, type SQL, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { dfds } from "../db/schema.ts";

type Db = DrizzleD1Database<Record<string, unknown>>;

/** Teto de caracteres do JSON de cada comando (abaixo dos 2 MB por valor do D1). */
export const MAX_JSON_COMANDO = 900_000;

/** Fatias da lista cujo JSON fica abaixo do teto (uma ida ao D1 por fatia — nunca um comando por DFD). */
export function fatiasJson<T>(itens: readonly T[], max = MAX_JSON_COMANDO): T[][] {
  const out: T[][] = [];
  let atual: T[] = [];
  let tam = 2;
  for (const x of itens) {
    const t = JSON.stringify(x).length + 1;
    if (atual.length && tam + t > max) {
      out.push(atual);
      atual = [];
      tam = 2;
    }
    atual.push(x);
    tam += t;
  }
  if (atual.length) out.push(atual);
  return out;
}

/**
 * A SITUAÇÃO da Centi nos DFDs (a Execução pela CM002): UM UPDATE…FROM json_each por fatia. FORA de `db.batch` (sql cru
 * com parâmetros). Só os DFDs que existem são tocados (a junção).
 */
export function comandosGravarExecucao(db: Db, itens: readonly { id: number; situacao: string | null }[], em: string) {
  return fatiasJson(itens.map((x) => ({ i: x.id, s: x.situacao }))).map((f) =>
    db.run(sql`UPDATE dfds SET execucao_centi = v.s, execucao_centi_em = ${em}
      FROM (SELECT json_extract(value, '$.i') AS i, json_extract(value, '$.s') AS s FROM json_each(${JSON.stringify(f)}) LIMIT -1) AS v
      WHERE dfds.id = v.i`),
  );
}

/** O resultado da CONFERÊNCIA dos DFDs × Centi (status + motivo): o mesmo UPDATE…FROM json_each, fora de `db.batch`. */
export function comandosGravarConferencia(db: Db, itens: readonly { dfdId: number; status: string; motivo?: string | null }[], em: string) {
  return fatiasJson(itens.map((x) => ({ i: x.dfdId, s: x.status, m: x.motivo ?? null }))).map((f) =>
    db.run(sql`UPDATE dfds SET conferencia_centi = v.s, conferencia_centi_motivo = v.m, conferencia_centi_em = ${em}
      FROM (SELECT json_extract(value, '$.i') AS i, json_extract(value, '$.s') AS s, json_extract(value, '$.m') AS m FROM json_each(${JSON.stringify(f)}) LIMIT -1) AS v
      WHERE dfds.id = v.i`),
  );
}

/** O escopo da leitura da Execução (POST): os DFDs pedidos (ids num parâmetro JSON) que têm planejamento. */
export const condicaoExecucao = (ids: readonly number[]): SQL =>
  and(isNotNull(dfds.planejamento), sql`${dfds.id} IN (SELECT value FROM json_each(${JSON.stringify([...new Set(ids)])}))`) as SQL;

/**
 * O plano da gravação da conferência: só os DFDs que ainda existem (`existentes`) — o retrato/PDF de um excluído quebraria
 * a FK e o lote inteiro. `retratoValido` = o retrato que se lê (senão vale como ausente).
 */
export function planoConferencia<T extends { dfdId: number; retrato?: string; pdf?: string }>(
  unicos: readonly T[],
  existentes: { has(id: number): boolean },
  retratoValido: (r: string) => boolean,
) {
  const vivos = unicos.filter((x) => existentes.has(x.dfdId));
  const comRetrato = vivos.filter((x) => x.retrato && retratoValido(x.retrato));
  const semRetrato = vivos.filter((x) => !comRetrato.includes(x)).map((x) => x.dfdId);
  const semPdf = [...semRetrato, ...comRetrato.filter((x) => !x.pdf).map((x) => x.dfdId)];
  return { vivos, comRetrato, semRetrato, semPdf };
}
