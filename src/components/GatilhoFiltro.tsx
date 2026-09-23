import { IconArrowDown, IconArrowUp, IconChevronDown, IconFilter } from "./icons";

/**
 * Gatilho do filtro de CABEÇALHO de tabela — o MESMO nos três tipos (valores, datas e faixa R$):
 * rótulo + seta da ordenação + chevron. Coluna FILTRADA = tópico MARCADO (fundo/texto accent + ícone
 * de funil), para o usuário ver de relance quais colunas restringem a tabela.
 */
export function GatilhoFiltro({ label, sortDir = null, marcado = false }: { label: string; sortDir?: "asc" | "desc" | null; marcado?: boolean }) {
  return (
    <span
      className={`flex w-full items-center gap-1.5 rounded-chip px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.05em] transition-colors duration-[var(--motion-duration)] ${
        marcado ? "bg-accent-soft text-accent" : "text-faint"
      }`}
    >
      <span className="truncate">{label}</span>
      {sortDir === "asc" && <IconArrowUp className="h-3 w-3 shrink-0" />}
      {sortDir === "desc" && <IconArrowDown className="h-3 w-3 shrink-0" />}
      {marcado ? (
        <IconFilter className="ml-auto h-3.5 w-3.5 shrink-0" aria-label="Filtrada" />
      ) : (
        <IconChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 opacity-60" />
      )}
    </span>
  );
}
