"use client";

/**
 * CHIPS de escolha (como os filtros "Tudo · 2024 · 2025" do Trello): uma fileira de botões-pílula que QUEBRA linha
 * (cabe qualquer quantidade, ao contrário do `Segmented`); `valor` = o marcado (`aria-pressed`, accent) ou `null` =
 * nenhum (chips que só disparam uma ação — ex.: as pesquisas sugeridas). Alvos de 44px no toque.
 */
export function ChipsEscolha<T extends string>({
  opcoes,
  valor = null,
  onEscolher,
  ariaLabel,
}: {
  opcoes: { value: T; label: string }[];
  valor?: T | null;
  onEscolher: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <fieldset aria-label={ariaLabel} className="flex min-w-0 flex-wrap gap-1.5">
      {opcoes.map((o) => {
        const ativo = o.value === valor;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={valor == null ? undefined : ativo}
            onClick={() => onEscolher(o.value)}
            className={`min-h-11 rounded-control border px-3 text-[13px] font-medium transition-colors duration-[var(--motion-duration)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 lg:min-h-8 ${
              ativo ? "border-accent bg-accent-soft text-accent" : "border-border-2 bg-surface text-text-2 hover:bg-surface-2"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </fieldset>
  );
}
