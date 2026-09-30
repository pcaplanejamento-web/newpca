import { and, ne, sql } from "drizzle-orm";
import { usuarios } from "@/db/schema";
import { chaveMatricula } from "./cadastro-core";

export { violouMatriculaUnica } from "./cadastro-core";
import { getDb } from "./db";

// UNICIDADE da MATRÍCULA (o e-mail já é único por índice): a MESMA régua do gatilho do banco (`0071`) — sem espaços e sem
// os zeros à esquerda ("00123" = "123").

export const MSG_MATRICULA_EM_USO = "Esta matrícula já está cadastrada. Se for a sua, entre ou fale com o administrador.";

/** A matrícula já é de outra pessoa (`excetoId` = a própria, na edição)? */
export async function matriculaEmUso(matricula: string | null | undefined, excetoId?: number): Promise<boolean> {
  const chave = chaveMatricula(matricula ?? "");
  if (!chave) return false;
  const [r] = await getDb()
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(and(sql`ltrim(trim(${usuarios.matricula}), '0') = ${chave}`, excetoId ? ne(usuarios.id, excetoId) : undefined))
    .limit(1);
  return !!r;
}
