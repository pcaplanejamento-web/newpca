import type { DfdItemPayload, DfdMetaPayload } from "./dfd-validation";

/**
 * Envio de um DFD ao servidor em LOTES de itens — roda NO NAVEGADOR. Escala a
 * milhares de itens sem estourar o request (start-dfd + append-dfd-itens), dentro
 * dos limites do Worker/D1. Reusado pelo import avulso (`DfdUploadForm`) e pelo de
 * protocolo (`ProtocoloUploadForm`). `onLote(enviados, total)` reporta progresso.
 */

const LOTE = 200; // itens por request no cliente (o servidor aceita até 1000)

async function postDfd(body: unknown): Promise<{ dfdId?: number }> {
  const res = await fetch("/api/dfd", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = (await res.json()) as { ok?: boolean; error?: string; dfdId?: number };
  if (!res.ok || !j.ok) throw new Error(j.error ?? "Erro ao gravar o DFD.");
  return j;
}

export async function enviarDfdEmLotes(
  meta: DfdMetaPayload,
  itens: DfdItemPayload[],
  onLote?: (enviados: number, total: number) => void,
): Promise<{ dfdId: number }> {
  const total = itens.length;
  const j = await postDfd({ mode: "start-dfd", ...meta, totalItens: total, rows: itens.slice(0, LOTE) });
  const dfdId = Number(j.dfdId);
  onLote?.(Math.min(LOTE, total), total);
  for (let i = LOTE; i < total; i += LOTE) {
    await postDfd({ mode: "append-dfd-itens", dfdId, desde: i, rows: itens.slice(i, i + LOTE) });
    onLote?.(Math.min(i + LOTE, total), total);
  }
  return { dfdId };
}
