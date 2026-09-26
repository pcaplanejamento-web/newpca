"use client";

import { useState } from "react";
import { OPCOES_LEMBRETE, rotuloLembrete } from "@/lib/calendario-core";
import { dataBR } from "@/lib/format";
import type { Pessoa } from "@/lib/pessoa";
import {
  DIAS_CURTOS,
  type DadosEvento,
  type EventoTarefa,
  FREQUENCIAS,
  type Frequencia,
  horaValida,
  ROTULO_FREQUENCIA,
  type RecorrenciaEvento,
  rotuloData,
  rotuloRecorrenciaEvento,
  unidadeFrequencia,
} from "@/lib/tarefas-core";
import { Button } from "./Button";
import { ColorField } from "./ColorField";
import { SelectField, TextArea, TextField } from "./Field";
import { IconBell, IconCalendar, IconClock, IconCopy, IconPencil, IconPlus, IconRepetir, IconTrash, IconUsers } from "./icons";
import { Segmented } from "./Segmented";
import { SeletorPessoas } from "./SeletorPessoas";
import { Switch } from "./Switch";

/** Um evento como a lista e o formulário o recebem (o gravado — sem a tarefa/autor). */
export type EventoLista = Omit<EventoTarefa, "tarefaId" | "criadoPor">;

/** Um evento em edição (os campos como o formulário os mostra — texto vazio = sem valor). */
export type RascunhoEvento = {
  titulo: string;
  data: string;
  /** Último dia (evento de vários dias); vazio = um dia só. */
  dataFim: string;
  diaInteiro: boolean;
  horaInicio: string;
  horaFim: string;
  local: string;
  descricao: string;
  cor: string | null;
  /** Minutos antes (texto do `<select>`); vazio = sem lembrete. */
  lembrete: string;
  /** A repetição própria; `null` = não se repete. */
  recorrencia: RecorrenciaEvento | null;
  linkReuniao: string;
  ocupado: boolean;
  privado: boolean;
  convidados: number[];
};

/** O rascunho de um evento (novo: o `lembretePadrao` da pessoa já vem escolhido). */
export const rascunhoEvento = (e?: Partial<EventoLista> & { data?: string }, lembretePadrao: number | null = null): RascunhoEvento => ({
  titulo: e?.titulo ?? "",
  data: e?.data ?? "",
  dataFim: e?.dataFim ?? "",
  diaInteiro: e?.diaInteiro ?? !e?.horaInicio,
  horaInicio: e?.horaInicio ?? "",
  horaFim: e?.horaFim ?? "",
  local: e?.local ?? "",
  descricao: e?.descricao ?? "",
  cor: e?.cor ?? null,
  lembrete: e?.lembreteMin != null ? String(e.lembreteMin) : e?.titulo == null && lembretePadrao != null ? String(lembretePadrao) : "",
  recorrencia: e?.recorrencia ?? null,
  linkReuniao: e?.linkReuniao ?? "",
  ocupado: e?.ocupado ?? true,
  privado: e?.privado ?? false,
  convidados: (e?.convidados ?? []).map((c) => c.usuarioId),
});

type Problemas = { titulo?: string; data?: string; dataFim?: string; horaInicio?: string; horaFim?: string; linkReuniao?: string; recorrencia?: string };
/** O que falta/está errado no rascunho (a mesma régua do `eventoSchema`); vazio = pode gravar. */
export function problemasEvento(r: RascunhoEvento): Problemas {
  const p: Problemas = {};
  const dataOk = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
  if (!r.titulo.trim()) p.titulo = "Dê um título ao evento.";
  if (!dataOk(r.data)) p.data = "Escolha a data.";
  if (r.dataFim && (!dataOk(r.dataFim) || r.dataFim < r.data)) p.dataFim = "A data final tem de ser igual ou depois da data.";
  if (!r.diaInteiro) {
    if (!horaValida(r.horaInicio)) p.horaInicio = "Informe a hora de início.";
    if (r.horaFim && (!horaValida(r.horaFim) || (horaValida(r.horaInicio) && r.horaFim <= r.horaInicio))) p.horaFim = "O fim tem de ser depois do início.";
  }
  if (r.linkReuniao.trim() && !/^https:\/\/\S+$/i.test(r.linkReuniao.trim())) p.linkReuniao = "Use um link https://.";
  if (r.recorrencia?.ate && r.recorrencia.ate < r.data) p.recorrencia = "A repetição termina antes do evento.";
  return p;
}

/** O rascunho → os dados que a API recebe. */
export const dadosDoEvento = (r: RascunhoEvento): DadosEvento => ({
  titulo: r.titulo.trim(),
  data: r.data,
  dataFim: r.dataFim && r.dataFim > r.data ? r.dataFim : null,
  diaInteiro: r.diaInteiro,
  horaInicio: r.diaInteiro ? null : r.horaInicio || null,
  horaFim: r.diaInteiro ? null : r.horaFim || null,
  local: r.local.trim() || null,
  descricao: r.descricao.trim() || null,
  cor: r.cor,
  lembreteMin: r.lembrete === "" ? null : Number(r.lembrete),
  recorrencia: r.recorrencia ? { ...r.recorrencia, dias: r.recorrencia.freq === "semanal" ? r.recorrencia.dias : [] } : null,
  linkReuniao: r.linkReuniao.trim() || null,
  ocupado: r.ocupado,
  privado: r.privado,
  convidados: r.convidados,
});

/** "25/09/2026 · 09:30–10:00" / "25/09/2026 · dia inteiro" / "25/09 → 27/09/2026 · dia inteiro". */
export const quandoEvento = (e: Pick<DadosEvento, "data" | "dataFim" | "diaInteiro" | "horaInicio" | "horaFim">) =>
  `${e.dataFim && e.dataFim > e.data ? `${dataBR(e.data).slice(0, 5)} → ${dataBR(e.dataFim)}` : dataBR(e.data)} · ${e.diaInteiro || !e.horaInicio ? "dia inteiro" : `${e.horaInicio}${e.horaFim ? `–${e.horaFim}` : ""}`}`;

/** A REPETIÇÃO do evento no formulário (como a do Google: não se repete · diária · semanal com os dias · mensal · anual; a
 * cada N; termina numa data opcional). */
function EditorRepeticao({ valor, onChange, data, disabled }: { valor: RecorrenciaEvento | null; onChange: (r: RecorrenciaEvento | null) => void; data: string; disabled?: boolean }) {
  const diaSemana = data ? new Date(`${data}T12:00:00Z`).getUTCDay() : 1;
  return (
    <div className="space-y-2">
      <SelectField
        label="Repetição"
        value={valor?.freq ?? ""}
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.value as Frequencia | "";
          onChange(f ? { freq: f, intervalo: valor?.intervalo ?? 1, dias: f === "semanal" ? (valor?.dias.length ? valor.dias : [diaSemana]) : [], ate: valor?.ate ?? null } : null);
        }}
      >
        <option value="">Não se repete</option>
        {FREQUENCIAS.map((f) => (
          <option key={f} value={f}>
            {ROTULO_FREQUENCIA[f]}
          </option>
        ))}
      </SelectField>
      {valor && (
        <div className="space-y-2 rounded-control border border-border p-2.5">
          <div className="grid grid-cols-2 gap-2">
            <TextField
              label={`A cada (${unidadeFrequencia(valor.freq, valor.intervalo)})`}
              type="number"
              min={1}
              max={365}
              value={String(valor.intervalo)}
              disabled={disabled}
              onChange={(e) => onChange({ ...valor, intervalo: Math.max(1, Math.min(365, Number(e.target.value) || 1)) })}
            />
            <TextField label="Termina em (opcional)" type="date" value={valor.ate ?? ""} min={data || undefined} disabled={disabled} onChange={(e) => onChange({ ...valor, ate: e.target.value || null })} />
          </div>
          {valor.freq === "semanal" && (
            <fieldset className="flex flex-wrap gap-1 border-0 p-0" aria-label="Dias da semana">
              {DIAS_CURTOS.map((d, i) => {
                const on = valor.dias.includes(i);
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={disabled}
                    aria-pressed={on}
                    aria-label={d}
                    onClick={() => onChange({ ...valor, dias: on ? valor.dias.filter((x) => x !== i) : [...valor.dias, i].sort() })}
                    className={`grid h-11 w-11 place-items-center rounded-full text-[12px] font-semibold uppercase lg:h-8 lg:w-8 ${on ? "bg-accent text-white" : "bg-surface-2 text-text-2 hover:bg-border"}`}
                  >
                    {d.slice(0, 1)}
                  </button>
                );
              })}
            </fieldset>
          )}
          <p className="text-[12px] text-muted">{rotuloRecorrenciaEvento(valor)}</p>
        </div>
      )}
    </div>
  );
}

/**
 * O FORMULÁRIO de um evento (o bloco "Eventos" da tarefa e o "Mais opções"/"Editar" do Calendário): título, data e data
 * FINAL (vários dias), DIA INTEIRO ou início/fim, REPETIÇÃO própria, CONVIDADOS (pessoas do grupo — `pessoas`; sem a lista,
 * o campo não aparece), link da REUNIÃO, local, LEMBRETE, livre/ocupado, PRIVADO, descrição e a cor (sem cor própria = a do
 * quadro). Controlado — quem usa grava.
 */
export function EditorEvento({
  valor,
  onChange,
  disabled = false,
  pessoas,
  usuarioId = null,
}: {
  valor: RascunhoEvento;
  onChange: (v: RascunhoEvento) => void;
  disabled?: boolean;
  pessoas?: Pessoa[];
  usuarioId?: number | null;
}) {
  const set = <K extends keyof RascunhoEvento>(k: K, v: RascunhoEvento[K]) => onChange({ ...valor, [k]: v });
  const p = problemasEvento(valor);
  return (
    <div className="space-y-3">
      <TextField label="Título" value={valor.titulo} maxLength={120} disabled={disabled} placeholder="Ex.: Reunião com a unidade" onChange={(e) => set("titulo", e.target.value)} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Data" type="date" value={valor.data} disabled={disabled} error={valor.data ? p.data : undefined} onChange={(e) => set("data", e.target.value)} />
        <TextField label="Até (vários dias — opcional)" type="date" value={valor.dataFim} min={valor.data || undefined} disabled={disabled} error={p.dataFim} onChange={(e) => set("dataFim", e.target.value)} />
      </div>
      <div className="flex min-h-11 items-center">
        <Switch checked={valor.diaInteiro} disabled={disabled} onChange={(v) => set("diaInteiro", v)} label="Dia inteiro" />
      </div>
      {!valor.diaInteiro && (
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Início" type="time" value={valor.horaInicio} disabled={disabled} error={p.horaInicio} onChange={(e) => set("horaInicio", e.target.value)} />
          <TextField label="Fim (opcional)" type="time" value={valor.horaFim} disabled={disabled} error={p.horaFim} onChange={(e) => set("horaFim", e.target.value)} />
        </div>
      )}
      <EditorRepeticao valor={valor.recorrencia} onChange={(r) => set("recorrencia", r)} data={valor.data} disabled={disabled} />
      {pessoas && (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-[13.5px] font-bold text-text">
            <IconUsers className="h-4 w-4 text-muted" />
            Convidados
          </p>
          <SeletorPessoas pessoas={pessoas} selecionadas={valor.convidados} onChange={(ids) => set("convidados", ids)} disabled={disabled} usuarioId={usuarioId} />
        </div>
      )}
      <TextField
        label="Link da reunião (opcional)"
        type="url"
        value={valor.linkReuniao}
        maxLength={500}
        disabled={disabled}
        error={p.linkReuniao}
        placeholder="https://meet.google.com/…"
        onChange={(e) => set("linkReuniao", e.target.value)}
      />
      <TextField label="Local (opcional)" value={valor.local} maxLength={120} disabled={disabled} onChange={(e) => set("local", e.target.value)} />
      <SelectField label="Lembrete (no sino)" value={valor.lembrete} disabled={disabled} onChange={(e) => set("lembrete", e.target.value)}>
        <option value="">Sem lembrete</option>
        {OPCOES_LEMBRETE.map((o) => (
          <option key={o.min} value={String(o.min)}>
            {o.rotulo}
          </option>
        ))}
      </SelectField>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Segmented<"ocupado" | "livre">
          ariaLabel="Mostrar como"
          value={valor.ocupado ? "ocupado" : "livre"}
          disabled={disabled}
          onChange={(v) => set("ocupado", v === "ocupado")}
          options={[
            { value: "ocupado", label: "Ocupado" },
            { value: "livre", label: "Livre" },
          ]}
        />
        <Switch checked={valor.privado} disabled={disabled} onChange={(v) => set("privado", v)} label="Privado (os outros veem só “Ocupado”)" />
      </div>
      <TextArea label="Descrição (opcional)" rows={3} value={valor.descricao} maxLength={2000} disabled={disabled} onChange={(e) => set("descricao", e.target.value)} />
      <div className="space-y-2">
        <Switch checked={valor.cor != null} disabled={disabled} onChange={(v) => set("cor", v ? "#2563eb" : null)} label="Cor própria (sem ela, a cor do quadro)" />
        {valor.cor != null && <ColorField label="Cor do evento" value={valor.cor} onChange={(c) => set("cor", c)} />}
      </div>
    </div>
  );
}

/**
 * O bloco "EVENTOS" da tarefa: a lista (em ordem de data — data, horário, repetição, lembrete, convidados e a cor) com
 * editar/duplicar/excluir e "Adicionar evento" (o `EditorEvento` em linha). Só apresenta — quem usa grava
 * (`onSalvar(id|null, dados)` / `onExcluir`): na tarefa gravada, na hora; na tarefa nova, no rascunho (sem convidados —
 * `pessoas` ausente). `ocupado` = uma gravação em curso.
 */
export function EventosTarefa({
  eventos,
  hoje,
  onSalvar,
  onExcluir,
  disabled = false,
  ocupado = false,
  pessoas,
  usuarioId = null,
  lembretePadrao = null,
}: {
  eventos: EventoLista[];
  hoje: string;
  onSalvar: (id: number | null, dados: DadosEvento) => Promise<boolean>;
  onExcluir: (e: EventoLista) => void;
  disabled?: boolean;
  ocupado?: boolean;
  pessoas?: Pessoa[];
  usuarioId?: number | null;
  lembretePadrao?: number | null;
}) {
  const [editando, setEditando] = useState<{ id: number | null; r: RascunhoEvento } | null>(null);
  const ordenados = [...eventos].sort((a, b) => a.data.localeCompare(b.data) || (a.horaInicio ?? "").localeCompare(b.horaInicio ?? ""));
  const salvar = async () => {
    if (!editando || Object.keys(problemasEvento(editando.r)).length) return;
    if (await onSalvar(editando.id, dadosDoEvento(editando.r))) setEditando(null);
  };
  const form = editando && (
    <div className="space-y-3 rounded-card border border-accent/40 bg-surface p-3">
      <EditorEvento valor={editando.r} onChange={(r) => setEditando({ ...editando, r })} disabled={ocupado} pessoas={pessoas} usuarioId={usuarioId} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" disabled={ocupado} onClick={() => setEditando(null)}>
          Cancelar
        </Button>
        <Button size="sm" loading={ocupado} disabled={Object.keys(problemasEvento(editando.r)).length > 0} onClick={salvar}>
          {editando.id == null ? "Adicionar" : "Salvar"}
        </Button>
      </div>
    </div>
  );
  return (
    <div className="space-y-2">
      {ordenados.length > 0 && (
        <ul className="divide-y divide-border rounded-card border border-border">
          {ordenados.map((e) =>
            editando?.id === e.id ? (
              <li key={e.id} className="p-2">
                {form}
              </li>
            ) : (
              <li key={e.id} className="flex min-h-11 items-center gap-2 px-2 py-1.5">
                <span aria-hidden className="h-8 w-1 shrink-0 rounded-full" style={{ background: e.cor ?? "var(--accent)" }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-text" title={e.titulo}>
                    {e.titulo}
                    {e.privado && <span className="ml-1.5 text-[11px] font-normal text-muted">(privado)</span>}
                  </p>
                  <p className="flex flex-wrap items-center gap-x-2 text-[11.5px] text-muted">
                    <span className="inline-flex items-center gap-1">
                      {e.diaInteiro ? <IconCalendar className="h-3 w-3" /> : <IconClock className="h-3 w-3" />}
                      {rotuloData(e.data, hoje)}
                      {e.dataFim && e.dataFim > e.data ? ` → ${rotuloData(e.dataFim, hoje)}` : ""} · {e.diaInteiro || !e.horaInicio ? "dia inteiro" : `${e.horaInicio}${e.horaFim ? `–${e.horaFim}` : ""}`}
                    </span>
                    {e.recorrencia && (
                      <span className="inline-flex items-center gap-1" title={rotuloRecorrenciaEvento(e.recorrencia)}>
                        <IconRepetir className="h-3 w-3" />
                        {rotuloRecorrenciaEvento(e.recorrencia)}
                      </span>
                    )}
                    {e.lembreteMin != null && (
                      <span className="inline-flex items-center gap-1" title={rotuloLembrete(e.lembreteMin)}>
                        <IconBell className="h-3 w-3" />
                        {rotuloLembrete(e.lembreteMin)}
                      </span>
                    )}
                    {e.convidados.length > 0 && (
                      <span className="inline-flex items-center gap-1" title={`${e.convidados.length} convidado(s)`}>
                        <IconUsers className="h-3 w-3" />
                        {e.convidados.length}
                      </span>
                    )}
                    {e.local && <span className="truncate">{e.local}</span>}
                  </p>
                </div>
                {!disabled && (
                  <div className="flex shrink-0 gap-0.5">
                    <Button variant="ghost" size="xs" aria-label={`Editar ${e.titulo}`} icon={<IconPencil className="h-4 w-4" />} onClick={() => setEditando({ id: e.id, r: rascunhoEvento(e) })} />
                    <Button variant="ghost" size="xs" aria-label={`Duplicar ${e.titulo}`} title="Duplicar" icon={<IconCopy className="h-4 w-4" />} onClick={() => setEditando({ id: null, r: rascunhoEvento(e) })} />
                    <Button variant="ghost" size="xs" aria-label={`Excluir ${e.titulo}`} style={{ color: "var(--danger)" }} icon={<IconTrash className="h-4 w-4" />} onClick={() => onExcluir(e)} />
                  </div>
                )}
              </li>
            ),
          )}
        </ul>
      )}
      {editando?.id == null && form}
      {!disabled && !editando && (
        <Button variant="ghost" size="sm" icon={<IconPlus className="h-4 w-4" />} onClick={() => setEditando({ id: null, r: rascunhoEvento({ data: hoje }, lembretePadrao) })}>
          Adicionar evento
        </Button>
      )}
      {disabled && !ordenados.length && <p className="text-[12.5px] text-muted">Sem eventos.</p>}
    </div>
  );
}
