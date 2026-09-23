import type { DfdItemPayload, DfdMetaPayload } from "./dfd-validation";

/**
 * Envio de um DFD ao servidor em LOTES de itens — roda NO NAVEGADOR. Escala a
 * milhares de itens (start-dfd + append-dfd-itens) e é **all-or-nothing**: com
 * retry de falhas transitórias e, se um lote falhar de vez, apaga o DFD parcial
 * (não deixa DFD pela metade). Reusado pelo import avulso e pelo de protocolo.
 */

const LOTE = 200; // itens por request no cliente (o servidor aceita até 1000)
const TENTATIVAS = 3; // tentativas por request (só p/ falhas transitórias)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** POST /api/dfd com retry em falha de rede / HTTP 5xx (4xx não repete). */
async function postDfd(body: unknown): Promise<{ dfdId?: number }> {
  let ultimo: Error | null = null;
  for (let t = 0; t < TENTATIVAS; t++) {
    let res: Response;
    try {
      res = await fetch("/api/dfd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (e) {
      ultimo = e instanceof Error ? e : new Error("Falha de rede.");
      await sleep(400 * (t + 1)); // transitório → espera e tenta de novo
      continue;
    }
    if (res.ok) {
      const j = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; dfdId?: number } | null;
      if (j?.ok) return j;
      throw new Error(j?.error ?? "Erro ao gravar o DFD."); // ok:false → não repete
    }
    let msg = `Erro ${res.status} ao gravar o DFD.`;
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    if (j?.error) msg = j.error;
    if (res.status >= 500) {
      ultimo = new Error(msg); // servidor instável → retry
      await sleep(400 * (t + 1));
      continue;
    }
    throw new Error(msg); // 4xx (validação/permissão) → não adianta repetir
  }
  throw ultimo ?? new Error("Falha ao gravar o DFD.");
}

/** Apaga um DFD parcial (best-effort) — usado no rollback do all-or-nothing. */
async function apagarDfd(dfdId: number): Promise<void> {
  try {
    await fetch(`/api/dfd/${dfdId}`, { method: "DELETE" });
  } catch {
    // best-effort: se falhar, a re-importação (idempotente) resolve depois.
  }
}

export async function enviarDfdEmLotes(
  meta: DfdMetaPayload,
  itens: DfdItemPayload[],
  onLote?: (enviados: number, total: number) => void,
  /** `existia`: o DFD (mesmo nº) JÁ ESTAVA gravado — sobrescrita. Se um lote POSTERIOR falhar, NÃO apaga
   * (apagar perderia também a versão anterior): a falha diz que a gravação ficou INCOMPLETA p/ reenviar. */
  opcoes: { existia?: boolean } = {},
): Promise<{ dfdId: number }> {
  const total = itens.length;
  const j = await postDfd({ mode: "start-dfd", ...meta, totalItens: total, rows: itens.slice(0, LOTE) });
  const dfdId = Number(j.dfdId);
  let enviados = Math.min(LOTE, total);
  onLote?.(enviados, total);
  try {
    for (let i = LOTE; i < total; i += LOTE) {
      await postDfd({ mode: "append-dfd-itens", dfdId, desde: i, rows: itens.slice(i, i + LOTE) });
      enviados = Math.min(i + LOTE, total);
      onLote?.(enviados, total);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao gravar o DFD.";
    if (opcoes.existia) throw new Error(`${msg} — gravação INCOMPLETA (${enviados} de ${total} itens): reenvie para completar.`);
    await apagarDfd(dfdId); // DFD novo: não deixa DFD parcial
    throw e;
  }
  return { dfdId };
}
