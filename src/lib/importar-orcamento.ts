import type { OrcamentoItemImport } from "./orcamento-validation";

/**
 * Envio de um ORÇAMENTO ao servidor em LOTES de lançamentos — roda NO NAVEGADOR. Espelha
 * `importar-catalogo.ts`: retry de falhas transitórias (rede/5xx; 4xx não repete) e
 * all-or-nothing — o orçamento é SEMPRE criado agora, então se um lote falhar de vez,
 * apaga o parcial. O 1º request cria e devolve o id; os demais fazem append.
 */

const LOTE = 200; // lançamentos por request (o servidor aceita até 1000)
const TENTATIVAS = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function postOrcamento(body: unknown): Promise<{ orcamentoId?: number }> {
  let ultimo: Error | null = null;
  for (let t = 0; t < TENTATIVAS; t++) {
    let res: Response;
    try {
      res = await fetch("/api/orcamento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (e) {
      ultimo = e instanceof Error ? e : new Error("Falha de rede.");
      await sleep(400 * (t + 1));
      continue;
    }
    if (res.ok) {
      const j = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; orcamentoId?: number } | null;
      if (j?.ok) return j;
      throw new Error(j?.error ?? "Erro ao gravar o orçamento."); // ok:false → não repete
    }
    let msg = `Erro ${res.status} ao gravar o orçamento.`;
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    if (j?.error) msg = j.error;
    if (res.status >= 500) {
      ultimo = new Error(msg);
      await sleep(400 * (t + 1));
      continue;
    }
    throw new Error(msg); // 4xx (validação/permissão) → não adianta repetir
  }
  throw ultimo ?? new Error("Falha ao gravar o orçamento.");
}

async function apagarOrcamento(id: number): Promise<void> {
  try {
    await fetch(`/api/orcamento/${id}`, { method: "DELETE" });
  } catch {
    // best-effort
  }
}

export async function enviarOrcamentoEmLotes(
  meta: { nome: string; ano: number },
  itens: OrcamentoItemImport[],
  onLote?: (enviados: number, total: number) => void,
): Promise<{ orcamentoId: number }> {
  const total = itens.length;
  const j = await postOrcamento({
    mode: "start-orcamento",
    nome: meta.nome,
    ano: meta.ano,
    totalItens: total,
    rows: itens.slice(0, LOTE),
  });
  const orcamentoId = Number(j.orcamentoId);
  onLote?.(Math.min(LOTE, total), total);
  try {
    for (let i = LOTE; i < total; i += LOTE) {
      await postOrcamento({ mode: "append-orcamento-itens", orcamentoId, desde: i, rows: itens.slice(i, i + LOTE) });
      onLote?.(Math.min(i + LOTE, total), total);
    }
  } catch (e) {
    await apagarOrcamento(orcamentoId); // sempre criado agora → apaga o parcial
    throw e;
  }
  return { orcamentoId };
}
