import { cifrarComAad, decifrar, decifrarComAad } from "./cripto.ts";

/**
 * O LOGIN DA CENTI — a parte PURA (testada em `tests/centi-login.test.ts`): o formato do que é cifrado, o dono amarrado
 * como dado adicional e a leitura do formato antigo (as preferências, antes da migração `0195`).
 */
export type LoginCenti = { usuario: string; senha: string; auto: boolean };

/** O propósito da chave derivada da mestra (HKDF): só este cofre usa esta chave. */
export const PROPOSITO_LOGIN_CENTI = "pca/centi-login/v2";

/** O dado adicional: o blob só abre na linha da MESMA pessoa. */
export const aadLoginCenti = (usuarioId: number) => `centi-login:u${usuarioId}`;

export const cifrarLoginCenti = (chave: Uint8Array, usuarioId: number, l: Pick<LoginCenti, "usuario" | "senha">) =>
  cifrarComAad(chave, JSON.stringify({ usuario: l.usuario, senha: l.senha }), aadLoginCenti(usuarioId));

function lerJson(claro: string | null): { usuario: string; senha: string; auto?: boolean } | null {
  if (!claro) return null;
  try {
    const j = JSON.parse(claro) as { usuario?: unknown; senha?: unknown; auto?: unknown };
    return typeof j.usuario === "string" && typeof j.senha === "string" && j.usuario && j.senha
      ? { usuario: j.usuario, senha: j.senha, ...(typeof j.auto === "boolean" ? { auto: j.auto } : {}) }
      : null;
  } catch {
    return null;
  }
}

/**
 * Abre o blob: o formato novo ("v2:", com o dono) pela chave derivada; o ANTIGO (o `cifrarSegredo` das preferências)
 * pela chave dos segredos — `legado` avisa que deve ser regravado no novo. `null` = não abre (outro dono, chave errada).
 */
export async function abrirLoginCenti(
  chave: Uint8Array,
  chaveLegada: Uint8Array,
  usuarioId: number,
  blob: string,
): Promise<{ usuario: string; senha: string; auto?: boolean; legado: boolean } | null> {
  if (blob.startsWith("v2:")) {
    const j = lerJson(await decifrarComAad(chave, blob, aadLoginCenti(usuarioId)));
    return j ? { ...j, legado: false } : null;
  }
  const j = lerJson(await decifrar(chaveLegada, blob));
  return j ? { ...j, legado: true } : null;
}

/** O usuário à vista na tela: só o começo ("jo•••"). */
export function mascararUsuario(u: string): string {
  const t = u.trim();
  if (!t) return "";
  return `${t.slice(0, Math.min(2, Math.max(1, t.length - 2)))}•••`;
}
