/**
 * Regras PURAS do cadastro institucional (sem zod → leves no navegador; o `auth-validation` as usa nos schemas).
 */

/** O domínio do E-MAIL INSTITUCIONAL — o único aceito no cadastro. */
export const DOMINIO_INSTITUCIONAL = "rioverde.go.gov.br";

/** É um e-mail institucional (`…@rioverde.go.gov.br`)? */
export function emailInstitucional(email: string): boolean {
  const e = email.trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+$/.test(e) && e.endsWith(`@${DOMINIO_INSTITUCIONAL}`);
}

/** NOME COMPLETO: ao menos duas palavras de 2+ letras (nome e sobrenome). */
export function nomeCompleto(nome: string): boolean {
  return nome.trim().split(/\s+/u).filter((p) => p.length >= 2).length >= 2;
}
