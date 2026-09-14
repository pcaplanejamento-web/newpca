/**
 * Responsáveis por DFDs de uma repartição — armazenados como **JSON array** de nomes
 * na coluna `reparticoes.responsavel_dfd` (reaproveitada; sem migração). Puro/testável.
 * Parse tolerante: aceita o JSON novo E o valor antigo (uma única string).
 */

/** Lê a coluna → lista de nomes (limpa vazios/duplicados; tolera formato antigo). */
export function parseResponsaveis(raw: string | null | undefined): string[] {
  if (raw == null) return [];
  const s = String(raw).trim();
  if (!s) return [];
  if (s.startsWith("[")) {
    try {
      const arr: unknown = JSON.parse(s);
      if (Array.isArray(arr)) return limpar(arr.map((x) => String(x)));
    } catch {
      /* formato inválido → cai no fallback */
    }
  }
  return limpar([s]); // valor antigo (string única) vira 1 elemento
}

/** Lista de nomes → texto para gravar (JSON), ou `null` se vazia. */
export function serializeResponsaveis(nomes: string[]): string | null {
  const limpos = limpar(nomes);
  return limpos.length > 0 ? JSON.stringify(limpos) : null;
}

/** Trim + remove vazios + remove duplicados (preservando a ordem). */
function limpar(nomes: string[]): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const n of nomes) {
    const t = n.trim();
    if (t && !vistos.has(t)) {
      vistos.add(t);
      out.push(t);
    }
  }
  return out;
}
