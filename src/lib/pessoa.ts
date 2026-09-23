/**
 * PESSOA (usuário) como aparece no sistema — núcleo PURO/testável (sem getDb/JSX): o NOME DE EXIBIÇÃO (o
 * APELIDO do perfil ou, sem ele, o nome), a URL da FOTO (servida com cache pela rota da foto — a versão
 * muda quando o perfil é salvo, então o navegador só baixa a foto de novo nessa hora) e o rótulo das
 * opções dos seletores. Usado nas colunas Responsável/Distribuição da Mesa, nos seletores e no cabeçalho.
 */

/** Pessoa para exibição: `foto` é a URL da rota da foto (nunca o data-URL — não pesa nas listas). */
export type Pessoa = { id: number; nome: string; apelido: string | null; foto: string | null };

/** Tamanho máximo do apelido (curto: cabe numa célula da tabela). */
export const APELIDO_MAX = 40;

/** Nome de EXIBIÇÃO: o apelido (se houver) ou o nome. */
export function nomeExibicao(p: { nome: string; apelido?: string | null } | null | undefined): string {
  if (!p) return "";
  return p.apelido?.trim() || p.nome.trim();
}

/** Apelido normalizado para gravar: espaços colapsados; vazio ⇒ `null` (volta a valer o nome). */
export function normalizarApelido(v: string | null | undefined): string | null {
  const s = String(v ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return s ? s : null;
}

/** URL da foto do usuário (`null` sem foto). A `versao` (data da última gravação do perfil, só dígitos)
 * invalida o cache do navegador quando a foto muda. */
export function urlFoto(id: number, temFoto: boolean, versao: string | null | undefined): string | null {
  if (!temFoto) return null;
  const v = String(versao ?? "").replace(/\D/g, "");
  return `/api/usuarios/${id}/foto${v ? `?v=${v}` : ""}`;
}

/** Rótulo da pessoa numa lista de OPÇÕES (`<select>` nativo, que não mostra foto): o apelido e, quando
 * ele difere do nome, o nome completo para identificar; "(eu)" para o próprio usuário. */
export function rotuloOpcaoPessoa(p: { id: number; nome: string; apelido?: string | null }, euId?: number | null): string {
  const exib = nomeExibicao(p);
  const completo = p.nome.trim();
  const base = exib !== completo && completo ? `${exib} — ${completo}` : exib;
  return p.id === euId ? `${base} (eu)` : base;
}

/** Decodifica a foto gravada (data-URL base64 png/jpeg/webp) em bytes + tipo — `null` se ausente/inválida. */
export function decodificarFoto(dataUrl: string | null | undefined): { tipo: string; bytes: Uint8Array<ArrayBuffer> } | null {
  const m = /^data:(image\/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl ?? ""));
  if (!m) return null;
  try {
    const bin = atob(m[2].replace(/\s+/g, ""));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.length > 0 ? { tipo: m[1] === "image/jpg" ? "image/jpeg" : m[1], bytes } : null;
  } catch {
    return null;
  }
}
