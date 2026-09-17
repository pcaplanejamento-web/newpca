import type { CatalogoItemImport } from "./catalogo-validation";

/**
 * Envio de um CATÁLOGO ao servidor em LOTES de itens — roda NO NAVEGADOR. Espelha
 * `importar-dfd.ts`: retry de falhas transitórias (rede/5xx; 4xx não repete) e
 * all-or-nothing — se um lote falhar de vez e o catálogo foi CRIADO agora, apaga o
 * parcial (numa ATUALIZAÇÃO nunca apaga o catálogo que já existia). O 1º request cria
 * (ou mira um existente) e devolve o id; os demais fazem append.
 */

const LOTE = 200; // itens por request no cliente (o servidor aceita até 1000)
const TENTATIVAS = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function postCatalogo(body: unknown): Promise<{ catalogoId?: number }> {
  let ultimo: Error | null = null;
  for (let t = 0; t < TENTATIVAS; t++) {
    let res: Response;
    try {
      res = await fetch("/api/catalogo", {
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
      const j = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; catalogoId?: number } | null;
      if (j?.ok) return j;
      throw new Error(j?.error ?? "Erro ao gravar o catálogo."); // ok:false → não repete
    }
    let msg = `Erro ${res.status} ao gravar o catálogo.`;
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    if (j?.error) msg = j.error;
    if (res.status >= 500) {
      ultimo = new Error(msg);
      await sleep(400 * (t + 1));
      continue;
    }
    throw new Error(msg); // 4xx (validação/permissão/conflito) → não adianta repetir
  }
  throw ultimo ?? new Error("Falha ao gravar o catálogo.");
}

async function apagarCatalogo(id: number): Promise<void> {
  try {
    await fetch(`/api/catalogo/${id}`, { method: "DELETE" });
  } catch {
    // best-effort
  }
}

export type CatalogoMeta = {
  catalogoId: number | null; // null = criar novo; id = atualizar um existente (merge)
  nome: string;
  tiposPadrao: string[];
  excluirItens?: number[]; // ids de itens de OUTROS catálogos a remover (conflitos "substituir")
};

/** Cria um catálogo VAZIO (manual) — só nome + tipos. Devolve o id. */
export async function criarCatalogoVazio(nome: string, tiposPadrao: string[]): Promise<number> {
  const j = await postCatalogo({ mode: "criar-catalogo", nome, tiposPadrao });
  return Number(j.catalogoId);
}

export async function enviarCatalogoEmLotes(
  meta: CatalogoMeta,
  itens: CatalogoItemImport[],
  onLote?: (enviados: number, total: number) => void,
): Promise<{ catalogoId: number }> {
  const total = itens.length;
  const j = await postCatalogo({
    mode: "start-catalogo",
    catalogoId: meta.catalogoId,
    nome: meta.nome,
    tiposPadrao: meta.tiposPadrao,
    totalItens: total,
    rows: itens.slice(0, LOTE),
    excluirItens: meta.excluirItens ?? [], // resolvidos só no 1º lote (libera os códigos)
  });
  const catalogoId = Number(j.catalogoId);
  onLote?.(Math.min(LOTE, total), total);
  const criadoAgora = meta.catalogoId == null;
  try {
    for (let i = LOTE; i < total; i += LOTE) {
      await postCatalogo({ mode: "append-catalogo-itens", catalogoId, desde: i, rows: itens.slice(i, i + LOTE) });
      onLote?.(Math.min(i + LOTE, total), total);
    }
  } catch (e) {
    if (criadoAgora) await apagarCatalogo(catalogoId); // não apaga um catálogo pré-existente (update)
    throw e;
  }
  return { catalogoId };
}
