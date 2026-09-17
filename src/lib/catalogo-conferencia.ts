import { normUnidadeMedida } from "./normalize.ts";
import { norm } from "./parse-dfd-comum.ts";
import { normalizarCodigo } from "./parse-catalogo-comum.ts";

/**
 * Núcleo PURO da CONFORMIDADE dos itens do DFD com o CATÁLOGO. Casa cada item pelo
 * CÓDIGO (único global) e confere DESCRIÇÃO, UNIDADE de medida e o TIPO do DFD contra a
 * entrada do catálogo; aponta item não catalogado, divergente ou com tipo incompatível
 * e propõe o item semelhante mais próximo (best-effort). Sem `getDb`/JSX → testável no
 * Node (como `reparticao-match.ts`). O acesso ao D1 fica em `catalogo.ts`; a severidade
 * de cada falta é decidida pelo ADM via `nivelDe` (pontos `item.*` de `avaliacao-core`).
 */

/** Uma entrada do catálogo (só os campos comparados), indexada pelo código normalizado. */
export type CatalogoRef = {
  codigo: string; // normalizado (só dígitos) — a chave
  codigoRaw: string | null; // forma de exibição
  descricao: string;
  unidade: string | null;
  tipos: string[]; // tipos de DFD permitidos (VAZIO = sem restrição)
  catalogoNome: string;
};

/** Índice `codigoNorm → entrada do catálogo`. */
export type CatalogoIndex = Map<string, CatalogoRef>;

export type FaltaCatalogoItem = "naoCatalogado" | "divergenteCatalogo" | "tipoIncompativel";

/** Rótulo curto de cada falta de conformidade (para a coluna "Catálogo" e o detalhe do item). */
export const ROTULO_FALTA_CATALOGO: Record<FaltaCatalogoItem, string> = {
  naoCatalogado: "Fora do catálogo",
  divergenteCatalogo: "Divergente",
  tipoIncompativel: "Tipo incompatível",
};

/** Precedência de exibição (a mais grave primeiro) — para escolher UMA falta a mostrar. */
const ORDEM_FALTA: FaltaCatalogoItem[] = ["naoCatalogado", "tipoIncompativel", "divergenteCatalogo"];

/** A falta "principal" (mais grave) de um conjunto — para o badge de uma linha. */
export function piorFalta(faltas: FaltaCatalogoItem[]): FaltaCatalogoItem | null {
  for (const f of ORDEM_FALTA) if (faltas.includes(f)) return f;
  return null;
}

export type SugestaoCatalogo = {
  codigo: string;
  codigoRaw: string | null;
  descricao: string;
  unidade: string | null;
  catalogoNome: string;
  score: number; // 1 = mesmo código (divergência de campos); <1 = por semelhança de descrição
};

export type ConferenciaItem = {
  faltas: FaltaCatalogoItem[];
  divergDescricao: boolean;
  divergUnidade: boolean;
  sugestao: SugestaoCatalogo | null;
};

/** Item do DFD — só o que é comparado. */
export type ItemConferivel = { codigo: string | null; descricao: string | null; unidade: string | null };

const CONFORME: ConferenciaItem = { faltas: [], divergDescricao: false, divergUnidade: false, sugestao: null };
/** Limiar de semelhança (Jaccard de tokens) para sugerir um item de catálogo a um não catalogado. */
export const LIMIAR_SEMELHANCA = 0.5;

/** Tokens distintos de uma descrição normalizada (para semelhança). Ignora tokens curtos. */
export function tokensDescricao(descricao: string | null | undefined): string[] {
  const n = norm(descricao ?? "");
  if (!n) return [];
  return [...new Set(n.split(" ").filter((t) => t.length >= 3))];
}

/** Similaridade de Jaccard entre duas descrições (0..1). */
export function similaridade(a: string | null | undefined, b: string | null | undefined): number {
  const ta = new Set(tokensDescricao(a));
  const tb = tokensDescricao(b);
  if (ta.size === 0 || tb.length === 0) return 0;
  let inter = 0;
  for (const t of tb) if (ta.has(t)) inter++;
  const uniao = ta.size + tb.length - inter;
  return uniao === 0 ? 0 : inter / uniao;
}

/** Melhor item de catálogo semelhante à descrição (≥ `LIMIAR_SEMELHANCA`), ou null. */
export function melhorSemelhante(descricao: string | null, candidatos: CatalogoRef[]): SugestaoCatalogo | null {
  let melhor: SugestaoCatalogo | null = null;
  for (const c of candidatos) {
    const s = similaridade(descricao, c.descricao);
    if (s >= LIMIAR_SEMELHANCA && (!melhor || s > melhor.score)) {
      melhor = { codigo: c.codigo, codigoRaw: c.codigoRaw, descricao: c.descricao, unidade: c.unidade, catalogoNome: c.catalogoNome, score: s };
    }
  }
  return melhor;
}

/**
 * Confere UM item do DFD. `entry` = entrada do catálogo do código (ou null se não achou);
 * `candidatos` = entradas para tentar semelhança quando não achou; `dfdTipo` = curto
 * (DFD-S/R/O/E) ou null. Item sem código → sem veredito (não é papel desta checagem).
 */
export function conferirItem(
  it: ItemConferivel,
  entry: CatalogoRef | null,
  dfdTipo: string | null,
  candidatos: CatalogoRef[] = [],
): ConferenciaItem {
  const codigo = normalizarCodigo(it.codigo);
  if (!codigo) return CONFORME;

  if (entry) {
    const divergDescricao = norm(it.descricao ?? "") !== norm(entry.descricao ?? "");
    const divergUnidade = normUnidadeMedida(it.unidade) !== normUnidadeMedida(entry.unidade);
    const faltas: FaltaCatalogoItem[] = [];
    if (divergDescricao || divergUnidade) faltas.push("divergenteCatalogo");
    // Tipo: só quando o item RESTRINGE tipos (tipos.length > 0) e o DFD tem um tipo conhecido.
    if (entry.tipos.length > 0 && dfdTipo && !entry.tipos.includes(dfdTipo)) faltas.push("tipoIncompativel");
    const sugestao: SugestaoCatalogo | null =
      divergDescricao || divergUnidade
        ? { codigo: entry.codigo, codigoRaw: entry.codigoRaw, descricao: entry.descricao, unidade: entry.unidade, catalogoNome: entry.catalogoNome, score: 1 }
        : null;
    return { faltas, divergDescricao, divergUnidade, sugestao };
  }

  return { faltas: ["naoCatalogado"], divergDescricao: false, divergUnidade: false, sugestao: melhorSemelhante(it.descricao, candidatos) };
}
