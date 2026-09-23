/**
 * FILTROS DE HIERARQUIA da Mesa (acima de Protocolos · DFDs · Itens): o RESPONSÁVEL do protocolo e o
 * ASSUNTO do protocolo. Valem para as três visões — o DFD e o item herdam o do protocolo de origem — e
 * travam as colunas correspondentes da tabela de protocolos (a hierarquia manda). Puro/testável.
 */

/** Responsável: todos · sem responsável · uma pessoa (id). Assunto: `null` = todos; "" = sem assunto. */
export type FiltroMesa = { responsavel: "todos" | "sem" | number; assunto: string | null };

export const FILTRO_MESA_TODOS: FiltroMesa = { responsavel: "todos", assunto: null };

/** Assunto comparável (espaços colapsados; vazio = ""). */
export const chaveAssunto = (a: string | null | undefined) => String(a ?? "").replace(/\s+/g, " ").trim();

/** O protocolo (ou o de origem do DFD/item) passa nos filtros da Mesa? */
export function passaFiltroMesa(p: { responsavelId: number | null; assunto: string | null }, f: FiltroMesa): boolean {
  if (f.responsavel === "sem" ? p.responsavelId != null : f.responsavel !== "todos" && p.responsavelId !== f.responsavel) return false;
  return f.assunto == null || chaveAssunto(p.assunto) === f.assunto;
}

/** Algum filtro ativo? */
export const filtroMesaAtivo = (f: FiltroMesa) => f.responsavel !== "todos" || f.assunto != null;

const COLLATOR = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

/** Assuntos DISTINTOS dos protocolos (ordem natural pt-BR); "" (sem assunto) por último, se houver. */
export function opcoesAssuntoMesa(protocolos: { assunto: string | null }[]): string[] {
  const set = new Set(protocolos.map((p) => chaveAssunto(p.assunto)));
  const temVazio = set.delete("");
  return [...[...set].sort(COLLATOR.compare), ...(temVazio ? [""] : [])];
}
