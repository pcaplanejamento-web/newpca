import { eq } from "drizzle-orm";
import { calendarioTokens, usuarios } from "@/db/schema";
import { getDb } from "./db";

/**
 * O LINK DE ASSINATURA (.ics) do calendário de cada pessoa (migração `0047`): um token aleatório de 32 bytes (base64url)
 * que só aparece ao ser gerado — o banco guarda o SHA-256 dele (vazou o banco, o link não vaza). Gerar de novo INVALIDA o
 * anterior; "Desligar" apaga. O link dá SÓ LEITURA do calendário da pessoa.
 */

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
export const hashToken = async (t: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)));

function novoToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Gera (ou troca) o link da pessoa — devolve o token em claro (a única vez). */
export async function gerarTokenCalendario(usuarioId: number): Promise<string> {
  const token = novoToken();
  const tokenHash = await hashToken(token);
  await getDb()
    .insert(calendarioTokens)
    .values({ usuarioId, tokenHash })
    .onConflictDoUpdate({ target: calendarioTokens.usuarioId, set: { tokenHash, criadoEm: new Date().toISOString().replace("T", " ").slice(0, 19) } });
  return token;
}

export async function revogarTokenCalendario(usuarioId: number) {
  await getDb().delete(calendarioTokens).where(eq(calendarioTokens.usuarioId, usuarioId));
}

/** A pessoa tem um link ativo? (quando foi gerado). */
export async function assinaturaDaPessoa(usuarioId: number): Promise<{ criadoEm: string | null } | null> {
  try {
    const [r] = await getDb().select({ criadoEm: calendarioTokens.criadoEm }).from(calendarioTokens).where(eq(calendarioTokens.usuarioId, usuarioId));
    return r ?? null;
  } catch {
    return null;
  }
}

/** O USUÁRIO (ATIVO) dono do token — `null` = link inválido, revogado ou de usuário inativo. */
export async function usuarioDoToken(token: string) {
  const [r] = await getDb()
    .select({ id: usuarios.id, nome: usuarios.nome, email: usuarios.email, role: usuarios.role, status: usuarios.status })
    .from(calendarioTokens)
    .innerJoin(usuarios, eq(usuarios.id, calendarioTokens.usuarioId))
    .where(eq(calendarioTokens.tokenHash, await hashToken(token)));
  return r && r.status === "ativo" ? r : null;
}
