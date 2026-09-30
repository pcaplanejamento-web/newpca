/**
 * Regras PURAS do cadastro institucional (sem zod → leves no navegador; o `auth-validation` as usa nos schemas). Cada
 * campo tem o FILTRO (o que a tela deixa digitar) e a REGRA (o que o servidor aceita) — a mesma régua dos dois lados.
 */

/** O domínio do E-MAIL INSTITUCIONAL — o único aceito no cadastro. */
export const DOMINIO_INSTITUCIONAL = "rioverde.go.gov.br";

/** Tamanhos máximos dos campos do cadastro. */
export const LIMITES_CADASTRO = { nome: 120, matricula: 15, usuarioEmail: 64, senhaMin: 8, senhaMax: 128 } as const;

/** A parte antes do "@": letras minúsculas sem acento, números, ".", "_" e "-" — começa e termina em letra/número e
 * nunca tem ".." (o padrão das caixas institucionais). */
const LOCAL_EMAIL_RE = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;

/** A parte antes do "@" é válida? */
export function usuarioEmailValido(local: string): boolean {
  return LOCAL_EMAIL_RE.test(local) && !local.includes("..");
}

/** É um e-mail institucional (`usuario@rioverde.go.gov.br`, com o usuário no padrão)? */
export function emailInstitucional(email: string): boolean {
  const e = email.trim().toLowerCase();
  const sufixo = `@${DOMINIO_INSTITUCIONAL}`;
  return e.endsWith(sufixo) && usuarioEmailValido(e.slice(0, -sufixo.length));
}

/** NOME: só letras (com acento), espaço, apóstrofo, hífen e ponto — começa por letra. */
const NOME_RE = /^\p{L}[\p{L}\p{M}' .-]*$/u;

/** O que a tela deixa digitar no NOME: tira números, símbolos e caracteres de controle; um espaço entre as palavras. */
export function filtrarNome(v: string): string {
  return v
    .replace(/[^\p{L}\p{M}' .-]/gu, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s'.-]+/u, "")
    .slice(0, LIMITES_CADASTRO.nome);
}

/** NOME COMPLETO: ao menos duas palavras de 2+ letras (nome e sobrenome). */
export function nomeCompleto(nome: string): boolean {
  return nome.trim().split(/\s+/u).filter((p) => p.length >= 2).length >= 2;
}

/** O nome é aceito (caracteres permitidos + nome e sobrenome)? */
export function nomeValido(nome: string): boolean {
  const n = nome.trim();
  return n.length <= LIMITES_CADASTRO.nome && NOME_RE.test(n) && nomeCompleto(n);
}

/** O que a tela deixa digitar na MATRÍCULA: só os dígitos. */
export function filtrarMatricula(v: string): string {
  return v.replace(/\D/g, "").slice(0, LIMITES_CADASTRO.matricula);
}

/** A matrícula é aceita: só dígitos (1 a 15), e não só zeros. */
export function matriculaValida(m: string): boolean {
  return /^\d{1,15}$/.test(m) && /[1-9]/.test(m);
}

/** A CHAVE de comparação da matrícula (sem espaços nem os zeros à esquerda): "00123" e "123" são a MESMA — a régua do
 * gatilho de matrícula única do banco. */
export function chaveMatricula(m: string): string {
  return m.trim().replace(/^0+/, "");
}

/** O erro veio do gatilho de MATRÍCULA ÚNICA do banco (`matricula_duplicada`)? Percorre as causas (o Drizzle embrulha o
 * erro do D1). */
export function violouMatriculaUnica(err: unknown): boolean {
  let e: unknown = err;
  for (let i = 0; e && i < 5; i++, e = (e as { cause?: unknown }).cause) if (/matricula_duplicada/.test(String((e as Error).message ?? e))) return true;
  return false;
}

/** O problema da SENHA NOVA (ou `null`): 8 a 128 caracteres, ao menos uma letra e um número. */
export function problemaSenha(s: string): string | null {
  if (s.length < LIMITES_CADASTRO.senhaMin) return `A senha deve ter ao menos ${LIMITES_CADASTRO.senhaMin} caracteres.`;
  if (s.length > LIMITES_CADASTRO.senhaMax) return `A senha deve ter no máximo ${LIMITES_CADASTRO.senhaMax} caracteres.`;
  if (!/\p{L}/u.test(s) || !/\d/.test(s)) return "A senha deve ter letras e números.";
  if (/[\p{Cc}]/u.test(s)) return "A senha tem caracteres não permitidos.";
  return null;
}

/**
 * O que a pessoa digita no campo do e-mail institucional: SÓ a parte antes do "@" (o domínio já vem preenchido). Colar o
 * e-mail inteiro também vale (fica a parte antes do "@"); fica minúsculo, sem acento e só com letras, números, ".", "_"
 * e "-".
 */
export function parteLocalEmail(v: string): string {
  return v
    .split("@")[0]
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, LIMITES_CADASTRO.usuarioEmail);
}

/** O e-mail institucional completo a partir da parte antes do "@" (vazia = ""). */
export function emailDaParteLocal(local: string): string {
  const l = parteLocalEmail(local);
  return l ? `${l}@${DOMINIO_INSTITUCIONAL}` : "";
}

/** Tem caractere de CONTROLE/invisível (quebra, tab, largura zero, bidi)? Recusado em todo campo de texto do acesso. */
export function temControle(v: string): boolean {
  return /[\p{Cc}\p{Cf}]/u.test(v);
}
