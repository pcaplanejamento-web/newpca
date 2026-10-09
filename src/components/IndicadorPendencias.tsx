"use client";

/**
 * O indicador ÚNICO de ERROS e ATENÇÕES dos banners (Protocolo e DFD): o ponto na cor da severidade, o rótulo curto
 * (a partir de 640px) e os chips com as contagens — vermelho = erros, âmbar = atenções. O MESMO botão abre o relatório
 * de pendências do protocolo e alterna o painel de mensagens do DFD (`aberto` marca o painel à vista). Sem nada a abrir
 * (`onClick` ausente), fica só como selo.
 */
export function IndicadorPendencias({
  erros,
  atencoes,
  rotulo,
  cor,
  alvo,
  aberto,
  onClick,
}: {
  erros: number;
  atencoes: number;
  /** O estado por extenso (ex.: "Com erro", "Editado"); sem ele, sai das contagens. */
  rotulo?: string;
  /** A cor do estado (a da importância do ADM); sem ela, a da severidade. */
  cor?: string;
  /** O que o toque abre — vai no nome acessível (ex.: "ver as mensagens"). */
  alvo: string;
  aberto?: boolean;
  onClick?: () => void;
}) {
  const severidade = erros > 0 ? "var(--danger)" : atencoes > 0 ? "var(--warn)" : "var(--ok)";
  const texto = rotulo ?? (erros > 0 ? "Com erro" : atencoes > 0 ? "Atenção" : "Sem pendências");
  const partes = [erros > 0 ? `${erros} ${erros === 1 ? "erro" : "erros"}` : "", atencoes > 0 ? `${atencoes} em atenção` : ""].filter(Boolean);
  const descricao = `${texto}${partes.length ? ` — ${partes.join(", ")}` : ""}${onClick ? ` · ${alvo}` : ""}`;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={descricao}
      title={descricao}
      aria-pressed={onClick ? !!aberto : undefined}
      className={`inline-flex h-11 min-w-11 shrink items-center justify-center gap-2 rounded-control border border-border-2 bg-surface px-2.5 text-[12.5px] font-semibold text-text transition-[background-color,box-shadow] duration-[var(--motion-duration)] hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-default disabled:hover:bg-surface lg:h-[var(--h-control-sm)] ${aberto ? "ring-2 ring-accent/40" : ""}`}
    >
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: cor ?? severidade }} />
      <span className="hidden truncate sm:inline" style={{ color: cor ?? severidade }}>
        {texto}
      </span>
      {erros > 0 && (
        <span className="rounded-full bg-[var(--danger)] px-1.5 text-[11px] leading-[18px] text-white tabular-nums">{erros}</span>
      )}
      {atencoes > 0 && (
        <span className="rounded-full bg-[var(--warn)] px-1.5 text-[11px] leading-[18px] text-white tabular-nums">{atencoes}</span>
      )}
    </button>
  );
}
