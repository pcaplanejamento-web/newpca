/**
 * Cliente das rotas da PADRONIZAÇÃO (Catálogo → Unidades de medida | Classificações): uma chamada JSON no envelope
 * `{ ok, error }` que devolve o corpo ou LANÇA a mensagem do servidor (a tela mostra no aviso). Sem dependências.
 */
export async function chamarPadronizacao<T = Record<string, unknown>>(url: string, metodo: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = "GET", corpo?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, {
      method: metodo,
      headers: corpo === undefined ? undefined : { "Content-Type": "application/json" },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
  } catch {
    throw new Error("Sem conexão com o servidor. Tente de novo.");
  }
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string } & T;
  if (!r.ok || !j.ok) throw new Error(j.error ?? "Não foi possível concluir. Tente de novo.");
  return j;
}
