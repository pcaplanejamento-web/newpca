import { type CatalogoRef, conferirItem } from "./catalogo-conferencia.ts";
import { brl, num } from "./format.ts";
import { normalizarCodigo } from "./parse-catalogo-comum.ts";

/**
 * EDIÇÃO EM MASSA de ITENS de DFDs gravados (lista "Itens" da Mesa) — núcleo PURO/testável. Planeja,
 * por DFD, o que muda em cada item selecionado, com as MESMAS travas da edição item a item:
 * - **Padronizar pelo catálogo**: descrição/unidade passam a ser as do catálogo (só o que diverge);
 *   item fora do catálogo é recusado;
 * - **Unidade de medida**: uma unidade IGUAL à do catálogo é travada (não se afasta do padrão);
 * - **Quantidade / Valor unitário**: o valor total do item é recalculado (quantidade × unitário);
 * - **Remover**: nunca deixa o DFD sem itens.
 * O servidor aplica o plano e recalcula NO BANCO o total do DFD (Σ valor total dos itens).
 */

export type CampoMassaItem = "catalogo" | "unidade" | "quantidade" | "valorUnitario" | "remover";
export type AcaoMassaItem =
  | { campo: "catalogo" }
  | { campo: "unidade"; valor: string }
  | { campo: "quantidade" | "valorUnitario"; valor: number }
  | { campo: "remover" };

/** Item gravado (o que o plano lê). */
export type ItemMassa = {
  id: number;
  item: number | null;
  codigo: string | null;
  descricao: string | null;
  unidade: string | null;
  quantidade: number | null;
  valorUnitario: number | null;
  valorTotal: number | null;
};
export type PatchItem = Partial<Pick<ItemMassa, "descricao" | "unidade" | "quantidade" | "valorUnitario" | "valorTotal">>;

export type PlanoMassaItens = {
  atualizar: { id: number; patch: PatchItem }[];
  remover: number[];
  /** Itens selecionados que a regra NÃO deixa alterar (com o motivo — vão para o relatório). */
  recusas: { id: number; item: number | null; motivo: string }[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Valor total do item após trocar quantidade/unitário: recalcula quando os dois existem; senão mantém. */
function totalRecalculado(qtd: number | null, vu: number | null, atual: number | null): number | null {
  return qtd != null && vu != null ? round2(qtd * vu) : atual;
}

/**
 * Plano de UM DFD: `itensDfd` = os itens dele (ao menos os selecionados); `alvos` = ids selecionados;
 * `catalogo` = entradas do catálogo pelo código normalizado (só as usadas); `totalNoDfd` = quantos itens o
 * DFD tem (trava "não fica sem itens"; padrão = `itensDfd.length`). Puro.
 */
export function planejarMassaItens(
  itensDfd: ItemMassa[],
  alvos: Set<number>,
  acao: AcaoMassaItem,
  catalogo: Map<string, CatalogoRef>,
  totalNoDfd = itensDfd.length,
): PlanoMassaItens {
  const plano: PlanoMassaItens = { atualizar: [], remover: [], recusas: [] };
  const sel = itensDfd.filter((it) => alvos.has(it.id));
  if (acao.campo === "remover") {
    if (sel.length >= totalNoDfd) {
      for (const it of sel) plano.recusas.push({ id: it.id, item: it.item, motivo: "o DFD ficaria sem itens" });
      return plano;
    }
    plano.remover = sel.map((it) => it.id);
    return plano;
  }
  for (const it of sel) {
    const entry = catalogo.get(normalizarCodigo(it.codigo)) ?? null;
    if (acao.campo === "catalogo") {
      if (!entry) {
        plano.recusas.push({ id: it.id, item: it.item, motivo: "fora do catálogo" });
        continue;
      }
      const c = conferirItem(it, entry, null);
      const patch: PatchItem = {};
      if (c.divergDescricao) patch.descricao = entry.descricao;
      if (c.divergUnidade) patch.unidade = entry.unidade;
      if (Object.keys(patch).length > 0) plano.atualizar.push({ id: it.id, patch });
      continue;
    }
    if (acao.campo === "unidade") {
      const v = acao.valor.trim();
      if (!v || (it.unidade ?? "") === v) continue;
      // Unidade IGUAL à do catálogo é travada (mesma regra do cadeado do item).
      if (entry && !conferirItem(it, entry, null).divergUnidade) {
        plano.recusas.push({ id: it.id, item: it.item, motivo: "unidade igual à do catálogo (travada)" });
        continue;
      }
      plano.atualizar.push({ id: it.id, patch: { unidade: v } });
      continue;
    }
    if (acao.campo === "quantidade") {
      if (it.quantidade === acao.valor) continue;
      plano.atualizar.push({
        id: it.id,
        patch: { quantidade: acao.valor, valorTotal: totalRecalculado(acao.valor, it.valorUnitario, it.valorTotal) },
      });
      continue;
    }
    if (it.valorUnitario === acao.valor) continue;
    plano.atualizar.push({
      id: it.id,
      patch: { valorUnitario: acao.valor, valorTotal: totalRecalculado(it.quantidade, acao.valor, it.valorTotal) },
    });
  }
  return plano;
}

/** Texto curto da ação (auditoria/confirmação). */
export function descreverAcaoItem(acao: AcaoMassaItem): string {
  if (acao.campo === "catalogo") return "padronizados pelo catálogo";
  if (acao.campo === "unidade") return `unidade → ${acao.valor}`;
  if (acao.campo === "quantidade") return `quantidade → ${num(acao.valor)}`;
  if (acao.campo === "valorUnitario") return `valor unitário → ${brl(acao.valor)}`;
  return "removidos";
}

/**
 * Fatia os itens selecionados em requisições de ≤ `maxDfds` DFDs e ≤ `maxItens` itens, SEM separar os
 * itens de um DFD entre fatias quando cabem numa só (cada DFD grava num lote atômico). Puro.
 */
export function fatiarItensPorDfd(ids: number[], dfdDe: Map<number, number>, maxDfds: number, maxItens: number): number[][] {
  const grupos = new Map<number, number[]>();
  for (const id of ids) {
    const dfd = dfdDe.get(id);
    if (dfd == null) continue;
    const g = grupos.get(dfd);
    if (g) g.push(id);
    else grupos.set(dfd, [id]);
  }
  const fatias: number[][] = [];
  let atual: number[] = [];
  let dfds = 0;
  for (const g of grupos.values()) {
    for (let i = 0; i < g.length; i += maxItens) {
      const parte = g.slice(i, i + maxItens);
      if (atual.length > 0 && (atual.length + parte.length > maxItens || dfds + 1 > maxDfds)) {
        fatias.push(atual);
        atual = [];
        dfds = 0;
      }
      atual.push(...parte);
      dfds++;
    }
  }
  if (atual.length > 0) fatias.push(atual);
  return fatias;
}

/** Agrupa recusas/falhas pelo MOTIVO para o relatório curto ("3 itens: fora do catálogo (DFD 12: 4, 7…)"). */
export function resumirFalhasItens(falhas: { dfd: string; item: number | null; motivo: string }[], max = 6): string[] {
  return resumirFalhas(
    falhas.map((f) => ({ ref: f.item != null ? `DFD ${f.dfd} item ${f.item}` : `DFD ${f.dfd}`, motivo: f.motivo })),
    ["item", "itens"],
    max,
  );
}

/**
 * Falhas de uma edição em massa (itens, DFDs ou protocolos) AGRUPADAS POR MOTIVO — uma linha por motivo com a
 * contagem e as referências (truncadas): "3 protocolos: Sem acesso à unidade deste protocolo (Protocolo 90/2026,
 * …)". Centenas de falhas iguais viram UMA linha legível. Puro.
 */
export function resumirFalhas(falhas: { ref: string; motivo: string }[], nomes: readonly [string, string], max = 6): string[] {
  const porMotivo = new Map<string, string[]>();
  for (const f of falhas) {
    const motivo = f.motivo.trim().replace(/\.$/, "");
    const l = porMotivo.get(motivo);
    if (l) l.push(f.ref);
    else porMotivo.set(motivo, [f.ref]);
  }
  return [...porMotivo.entries()].map(([motivo, refs]) => {
    const lista = refs.slice(0, max).join(", ") + (refs.length > max ? ` … (+${refs.length - max})` : "");
    return `${refs.length} ${refs.length === 1 ? nomes[0] : nomes[1]}: ${motivo} (${lista})`;
  });
}
