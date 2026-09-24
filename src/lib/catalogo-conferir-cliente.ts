import type { ConferenciaItem, ItemConferivel } from "./catalogo-conferencia";

/**
 * Confere os itens de UM DFD contra o catálogo chamando `POST /api/catalogo/conferir` (o servidor consulta só os
 * códigos do DFD — escalável, não baixa o catálogo). `ok: false` = FALHA (rede/HTTP) — distinta de "nada a mostrar"
 * (sem itens ou catálogo vazio: `ok: true` sem `conf`). Quem precisa saber se conferiu de fato (a análise do protocolo
 * com um ponto de catálogo BLOQUEANTE) usa esta; o resto usa `conferirItensCliente`.
 */
export async function conferirItensClienteResultado(
  itens: ItemConferivel[],
  tipo: string | null,
  signal?: AbortSignal,
): Promise<{ ok: boolean; conf?: Map<string, ConferenciaItem> }> {
  if (itens.length === 0) return { ok: true };
  try {
    const r = await fetch("/api/catalogo/conferir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo,
        itens: itens.map((i) => ({ codigo: i.codigo, descricao: i.descricao, unidade: i.unidade })),
      }),
      signal,
    });
    if (!r.ok) return { ok: false };
    const data = (await r.json()) as { ok?: boolean; conformidade?: [string, ConferenciaItem][] };
    if (!data.ok) return { ok: false };
    return data.conformidade && data.conformidade.length > 0 ? { ok: true, conf: new Map(data.conformidade) } : { ok: true };
  } catch {
    return { ok: false }; // rede/abort
  }
}

/**
 * O veredito por CÓDIGO normalizado, ou `undefined` quando não há o que mostrar (sem itens, catálogo vazio, ou
 * falha de rede). Auxiliar: erro é silencioso — a conferência é informativa e não deve travar a UI. Reusado por
 * import avulso, protocolo e DFD gravado.
 */
export async function conferirItensCliente(
  itens: ItemConferivel[],
  tipo: string | null,
  signal?: AbortSignal,
): Promise<Map<string, ConferenciaItem> | undefined> {
  return (await conferirItensClienteResultado(itens, tipo, signal)).conf;
}
