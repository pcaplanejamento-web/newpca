"use client";

import { OPCOES_LEMBRETE } from "@/lib/calendario-core";
import { COR_ESTADO_PRAZO, estadoPrazo, horaAgoraBrasilia, ROTULO_ESTADO_PRAZO } from "@/lib/tarefas-core";
import { SelectField, TextField } from "./Field";

/** As DATAS de uma tarefa (como o rascunho do detalhe as guarda: vazio = sem). */
export type DatasValor = { inicio: string; prazo: string; prazoHora: string; lembreteMin: number | null };

/**
 * As DATAS da tarefa (o padrão do Trello): início, PRAZO com HORA (vazia = o dia inteiro) e o LEMBRETE do prazo —
 * enviado aos responsáveis, às equipes e aos observadores (dia inteiro = às 08:00). Sem prazo, hora e lembrete ficam
 * desligados. Controlado: `onChange` recebe só o que mudou.
 */
export function DatasTarefa({
  valor: v,
  hoje,
  concluida = false,
  onChange,
}: {
  valor: DatasValor;
  hoje: string;
  concluida?: boolean;
  onChange: (patch: Partial<DatasValor>) => void;
}) {
  const ok = !v.inicio || !v.prazo || v.inicio <= v.prazo;
  const estado = estadoPrazo(v.prazo || null, hoje, concluida, v.prazoHora || null, horaAgoraBrasilia());
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField label="Início" type="date" value={v.inicio} onChange={(e) => onChange({ inicio: e.target.value })} />
      <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] gap-2">
        <TextField
          label="Prazo"
          type="date"
          value={v.prazo}
          // Sem prazo, some a hora e o lembrete.
          onChange={(e) => onChange(e.target.value ? { prazo: e.target.value } : { prazo: "", prazoHora: "", lembreteMin: null })}
          error={ok ? undefined : "O início não pode ser depois do prazo."}
          hint={
            v.prazo ? (
              <span className="font-semibold" style={{ color: COR_ESTADO_PRAZO[estado] }}>
                {ROTULO_ESTADO_PRAZO[estado]}
              </span>
            ) : undefined
          }
        />
        <TextField label="Hora" type="time" value={v.prazoHora} disabled={!v.prazo} hint={v.prazo && !v.prazoHora ? "Dia inteiro" : undefined} onChange={(e) => onChange({ prazoHora: e.target.value })} />
      </div>
      <div className="sm:col-span-2">
        <SelectField
          label="Lembrete"
          value={v.lembreteMin == null ? "" : String(v.lembreteMin)}
          disabled={!v.prazo}
          hint="Avisa no sino os responsáveis, as equipes e os observadores (dia inteiro = às 08:00)."
          onChange={(e) => onChange({ lembreteMin: e.target.value === "" ? null : Number(e.target.value) })}
        >
          <option value="">Sem lembrete</option>
          {OPCOES_LEMBRETE.map((o) => (
            <option key={o.min} value={o.min}>
              {o.rotulo}
            </option>
          ))}
        </SelectField>
      </div>
    </div>
  );
}
