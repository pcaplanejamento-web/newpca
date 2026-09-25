"use client";

import { dataBR } from "@/lib/format";
import { DIAS_CURTOS, FREQUENCIAS, type Frequencia, proximaOcorrencia, type Recorrencia, ROTULO_FREQUENCIA, rotuloRecorrencia, unidadeFrequencia } from "@/lib/tarefas-core";
import { TextField } from "./Field";
import { IconCheck } from "./icons";
import { Segmented } from "./Segmented";
import { Switch } from "./Switch";

/** A regra com que "Repetir" começa. */
const PADRAO: Recorrencia = { freq: "semanal", intervalo: 1, base: "prazo" };

/**
 * RECORRÊNCIA de uma tarefa (controlado): "Repetir" liga a regra — frequência (diária/semanal/mensal/anual), a cada N,
 * os DIAS da semana (semanal) e a base (do prazo = agenda fixa | da conclusão). Mostra a PRÓXIMA data que nasceria se a
 * tarefa fosse concluída hoje. Ao concluir, o servidor cria a próxima ocorrência na 1ª lista do quadro.
 */
export function RecorrenciaTarefa({
  valor,
  onChange,
  prazo,
  inicio,
  hoje,
  disabled = false,
}: {
  valor: Recorrencia | null;
  onChange: (r: Recorrencia | null) => void;
  prazo: string | null;
  inicio: string | null;
  hoje: string;
  disabled?: boolean;
}) {
  const r = valor;
  const set = (x: Partial<Recorrencia>) => r && onChange({ ...r, ...x });
  const proxima = r ? proximaOcorrencia(r, { inicio, prazo }, hoje, hoje).prazo : null;
  return (
    <div className="space-y-3">
      <Switch checked={!!r} disabled={disabled} onChange={(on) => onChange(on ? PADRAO : null)} label={r ? rotuloRecorrencia(r) : "Repetir esta tarefa"} />
      {r && (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <Segmented<Frequencia>
              ariaLabel="Frequência"
              value={r.freq}
              onChange={(freq) => set({ freq, ...(freq !== "semanal" ? { dias: undefined } : {}) })}
              options={FREQUENCIAS.map((f) => ({ value: f, label: ROTULO_FREQUENCIA[f] }))}
            />
            <div className="w-36">
              <TextField
                label={`A cada (${unidadeFrequencia(r.freq, r.intervalo)})`}
                type="number"
                min={1}
                max={365}
                value={String(r.intervalo)}
                disabled={disabled}
                onChange={(e) => set({ intervalo: Math.min(365, Math.max(1, Math.trunc(Number(e.target.value)) || 1)) })}
              />
            </div>
          </div>
          {r.freq === "semanal" && (
            <fieldset className="flex flex-wrap gap-1.5">
              <legend className="sr-only">Dias da semana</legend>
              {DIAS_CURTOS.map((d, i) => {
                const ativo = r.dias?.includes(i) ?? false;
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={ativo}
                    disabled={disabled}
                    onClick={() => {
                      const dias = ativo ? (r.dias ?? []).filter((x) => x !== i) : [...(r.dias ?? []), i].sort((a, b) => a - b);
                      set({ dias: dias.length ? dias : undefined });
                    }}
                    className={`inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-full px-3 text-[12.5px] font-semibold capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 lg:h-[var(--h-control-sm)] lg:min-w-[var(--h-control-sm)] ${
                      ativo ? "bg-accent text-white" : "bg-surface-2 text-text-2 hover:bg-border"
                    }`}
                  >
                    {ativo && <IconCheck className="h-3 w-3" />}
                    {d}
                  </button>
                );
              })}
            </fieldset>
          )}
          <Segmented<"prazo" | "conclusao">
            ariaLabel="A próxima conta a partir de"
            value={r.base}
            onChange={(base) => set({ base })}
            options={[
              { value: "prazo", label: "Do prazo (agenda fixa)" },
              { value: "conclusao", label: "Da conclusão" },
            ]}
          />
          {proxima && (
            <p className="text-[12.5px] text-muted">
              Concluída hoje, a próxima nasce na 1ª lista do quadro com prazo em <span className="font-semibold text-text">{dataBR(proxima)}</span> — com os mesmos
              responsáveis, etiquetas e o checklist desmarcado.
            </p>
          )}
        </>
      )}
    </div>
  );
}
