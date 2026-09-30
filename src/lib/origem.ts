/**
 * A requisição veio do PRÓPRIO site? (defesa contra CSRF, além do cookie SameSite=Lax): o navegador sempre manda o
 * `Origin` num POST/PATCH/DELETE — de outro site, é recusado. Sem `Origin` (chamada de servidor: cron, webhook), segue.
 */
export function origemPermitida(req: Request): boolean {
  const origem = req.headers.get("origin");
  if (!origem) return true;
  let host: string;
  try {
    host = new URL(origem).host;
  } catch {
    return false; // "null" (moldura isolada) ou inválido
  }
  let proprio = "";
  try {
    proprio = new URL(req.url).host;
  } catch {
    /* sem URL */
  }
  return host === proprio || host === req.headers.get("host") || host === req.headers.get("x-forwarded-host");
}
