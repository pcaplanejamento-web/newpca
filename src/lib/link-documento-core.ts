/**
 * LINK DO GOOGLE → o endereço que entrega o PDF (puro, testado). Docs/Planilhas/Apresentações = a exportação em PDF; Drive
 * = o download direto do arquivo. Outro link = `null` (só o Google é aceito — o arquivo precisa estar compartilhado como
 * "Qualquer pessoa com o link").
 */

const ID = "([A-Za-z0-9_-]{10,})";

export function urlPdfDoGoogle(link: string): string | null {
  let u: URL;
  try {
    u = new URL(link.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const caminho = u.pathname;
  if (u.hostname === "docs.google.com") {
    const m = new RegExp(`^/(document|spreadsheets|presentation)/d/${ID}`).exec(caminho);
    if (m) return `https://docs.google.com/${m[1]}/d/${m[2]}/export?format=pdf`;
    const f = new RegExp(`^/file/d/${ID}`).exec(caminho);
    if (f) return urlDrive(f[1]);
    return null;
  }
  if (u.hostname === "drive.google.com" || u.hostname === "drive.usercontent.google.com") {
    const m = new RegExp(`^/file/d/${ID}`).exec(caminho);
    const id = m?.[1] ?? u.searchParams.get("id");
    return id && new RegExp(`^${ID}$`).test(id) ? urlDrive(id) : null;
  }
  return null;
}

const urlDrive = (id: string) => `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;

/** O nome do documento a partir do arquivo baixado (sem ".pdf"), senão o padrão. */
export function nomeDoLink(nome: string | undefined): string {
  const n = (nome ?? "").replace(/\.pdf$/i, "").trim().slice(0, 120);
  return n || "Documento do Google";
}
