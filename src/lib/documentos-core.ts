/** Os PCAs de um documento: "todos" ou os ids (vazio = nenhum). Núcleo puro (tela, rotas e testes). */
export type PcasDocumento = "todos" | number[];

/** Lê o gravado (NULL/inválido = nenhum). */
export function lerPcasDocumento(v: string | null | undefined): PcasDocumento {
  if (v === "todos") return "todos";
  try {
    const l = JSON.parse(v ?? "[]");
    return Array.isArray(l) ? [...new Set(l.filter((x): x is number => Number.isInteger(x) && x > 0))] : [];
  } catch {
    return [];
  }
}

/** O texto a gravar (nenhum = NULL). */
export function gravarPcasDocumento(p: PcasDocumento): string | null {
  if (p === "todos") return "todos";
  const ids = [...new Set(p)].sort((a, b) => a - b);
  return ids.length ? JSON.stringify(ids) : null;
}

/** O documento aparece no PCA? */
export const documentoNoPca = (p: PcasDocumento, pcaId: number) => p === "todos" || p.includes(pcaId);

/** Acrescenta ou tira UM PCA ("todos" segue todos ao acrescentar; tirar de "todos" vira os demais da lista dada). */
export function alternarPcaDocumento(p: PcasDocumento, pcaId: number, incluir: boolean, todosIds: number[]): PcasDocumento {
  const base = p === "todos" ? todosIds : p;
  if (incluir) return p === "todos" ? "todos" : [...new Set([...base, pcaId])];
  return base.filter((x) => x !== pcaId);
}

/** O filtro de PCA da tela: "" = todos os documentos; "sem" = sem PCA; senão o id. */
export function passaFiltroPca(p: PcasDocumento, filtro: string): boolean {
  if (!filtro) return true;
  if (filtro === "sem") return p !== "todos" && p.length === 0;
  return documentoNoPca(p, Number(filtro));
}

/** O texto curto dos PCAs (o card). */
export function rotuloPcasDocumento(p: PcasDocumento, nomes: Map<number, string>): string {
  if (p === "todos") return "Todos os PCAs";
  if (!p.length) return "Nenhum PCA";
  const n = p.map((id) => nomes.get(id)).filter(Boolean);
  return n.length === 1 ? (n[0] as string) : `${p.length} PCAs`;
}

/**
 * GRUPOS: com os PCAs do grupo ativo restritos (`permitidos`), a pessoa vê o documento geral (sem PCA), o de "todos" e o
 * vinculado a algum PCA do grupo — o vinculado só a PCAs de fora some. `null` = sem restrição (o ADM, ou grupo com todos).
 */
export function documentoVisivel(p: PcasDocumento, permitidos: Set<number> | null): boolean {
  if (!permitidos || p === "todos" || p.length === 0) return true;
  return p.some((id) => permitidos.has(id));
}

/**
 * O que gravar quando a pessoa (restrita aos `permitidos`) troca os PCAs: ela só mexe nos PCAs do grupo — os de fora
 * ficam como estavam. "Todos" (pedir ou alterar) só sem restrição → `null` = recusado.
 */
export function mesclarPcasDoGrupo(antes: PcasDocumento, novos: PcasDocumento, permitidos: Set<number> | null): PcasDocumento | null {
  if (!permitidos) return novos;
  if (novos === "todos" || antes === "todos") return null;
  return [...antes.filter((x) => !permitidos.has(x)), ...novos.filter((x) => permitidos.has(x))];
}
