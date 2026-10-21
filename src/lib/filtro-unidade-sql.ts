import { type Column, type SQL, sql } from "drizzle-orm";

/** A condição da unidade numa consulta: UMA unidade ou VÁRIAS — a "Geral" das minhas unidades — num parâmetro só
 * (`json_each`, sem o limite de 100 parâmetros do D1). */
export function condUnidade(coluna: Column | SQL, rep: number | readonly number[]): SQL {
  if (typeof rep === "number") return sql`${coluna} = ${rep}`;
  return sql`${coluna} IN (SELECT value FROM json_each(${JSON.stringify(rep)}))`;
}
