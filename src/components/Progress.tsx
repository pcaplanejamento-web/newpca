/**
 * Barra de progresso DETERMINADA (design system). Por token do ADM (`bg-track` +
 * `bg-accent`) → acompanha o tema. Acessível (`role="progressbar"`). Usada nos
 * imports em lotes (planilha, DFD, protocolo). Responsiva (largura 100%).
 */
export function Progress({ value, label, continuo = false }: { value: number; label?: string; continuo?: boolean }) {
  const exato = Math.max(0, Math.min(100, value));
  const pct = Math.round(exato);
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
          // `continuo` = o valor muda a cada quadro (um relógio): sem transição e sem arredondar — anda liso.
          className={`h-full rounded-full bg-accent ${continuo ? "" : "transition-all duration-300"}`}
          style={{ width: `${continuo ? exato : pct}%` }}
        />
      </div>
      {label && !continuo && <p className="mt-1.5 text-xs text-muted">{label}</p>}
    </div>
  );
}
