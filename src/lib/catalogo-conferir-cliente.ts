import type { ConferenciaItem, ItemConferivel } from "./catalogo-conferencia";

/**
 * Confere os itens de UM DFD contra o catálogo chamando `POST /api/catalogo/conferir` (o
 * servidor consulta só os códigos do DFD — escalável, não baixa o catálogo). Devolve o
 * veredito por CÓDIGO normalizado, ou `undefined` quando não há o que mostrar (sem itens,
 * catálogo vazio, ou falha de rede). Auxiliar: erro é silencioso — a conferência é
 * informativa e não deve travar a UI. Reusado por import avulso, protocolo e DFD gravado.
 */
export async function conferirItensCliente(
  itens: ItemConferivel[],
  tipo: string | null,
  signal?: AbortSignal,
): Promise<Map<string, ConferenciaItem> | undefined> {
  if (itens.length === 0) return undefined;
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
    if (!r.ok) return undefined;
    const data = (await r.json()) as { ok?: boolean; conformidade?: [string, ConferenciaItem][] };
    if (!data.ok || !data.conformidade || data.conformidade.length === 0) return undefined;
    return new Map(data.conformidade);
  } catch {
    return undefined; // rede/abort — silencioso (conferência é auxiliar)
  }
}
