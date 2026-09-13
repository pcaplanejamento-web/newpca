/**
 * Barra de progresso DETERMINADA (design system). Por token do ADM (`bg-track` +
 * `bg-accent`) → acompanha o tema. Acessível (`role="progressbar"`). Usada nos
 * imports em lotes (planilha, DFD, protocolo). Responsiva (largura 100%).
 */
export function Progress({ value, label }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Progresso"}
        className="h-2 w-full overflow-hidden rounded-full bg-track"
      >
        <div
          className="h-full rounded-full bg-accent transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      {label && <p className="mt-1.5 text-xs text-muted">{label}</p>}
    </div>
  );
}
