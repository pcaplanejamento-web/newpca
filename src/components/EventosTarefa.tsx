"use client";

import { useState } from "react";
import { OPCOES_LEMBRETE, rotuloLembrete } from "@/lib/calendario-core";
import { dataBR } from "@/lib/format";
import { type DadosEvento, horaValida, rotuloData } from "@/lib/tarefas-core";
import { Button } from "./Button";
import { ColorField } from "./ColorField";
import { SelectField, TextArea, TextField } from "./Field";
import { IconBell, IconCalendar, IconClock, IconCopy, IconPencil, IconPlus, IconTrash } from "./icons";
import { Switch } from "./Switch";

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
};

export const rascunhoEvento = (e?: Partial<DadosEvento> & { data?: string }): RascunhoEvento => ({
  titulo: e?.titulo ?? "",
  data: e?.data ?? "",
  dataFim: e?.dataFim ?? "",
  diaInteiro: e?.diaInteiro ?? !e?.horaInicio,
  horaInicio: e?.horaInicio ?? "",
  horaFim: e?.horaFim ?? "",
  local: e?.local ?? "",
  descricao: e?.descricao ?? "",
  cor: e?.cor ?? null,
  lembrete: e?.lembreteMin == null ? "" : String(e.lembreteMin),
});

/** O que falta/está errado no rascunho (a mesma régua do `eventoSchema`); vazio = pode gravar. */
export function problemasEvento(r: RascunhoEvento): { titulo?: string; data?: string; dataFim?: string; horaInicio?: string; horaFim?: string } {
  const p: { titulo?: string; data?: string; dataFim?: string; horaInicio?: string; horaFim?: string } = {};
  if (!r.titulo.trim()) p.titulo = "Dê um título ao evento.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.data)) p.data = "Escolha a data.";
  if (r.dataFim && (!/^\d{4}-\d{2}-\d{2}$/.test(r.dataFim) || r.dataFim < r.data)) p.dataFim = "A data final tem de ser igual ou depois da data.";
  if (!r.diaInteiro) {
    if (!horaValida(r.horaInicio)) p.horaInicio = "Informe a hora de início.";
    if (r.horaFim && (!horaValida(r.horaFim) || (horaValida(r.horaInicio) && r.horaFim <= r.horaInicio))) p.horaFim = "O fim tem de ser depois do início.";
  }
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
});

/** "25/09/2026 · 09:30–10:00" / "25/09/2026 · dia inteiro" / "25/09 → 27/09/2026 · dia inteiro". */
export const quandoEvento = (e: Pick<DadosEvento, "data" | "dataFim" | "diaInteiro" | "horaInicio" | "horaFim">) =>
  `${e.dataFim && e.dataFim > e.data ? `${dataBR(e.data).slice(0, 5)} → ${dataBR(e.dataFim)}` : dataBR(e.data)} · ${e.diaInteiro || !e.horaInicio ? "dia inteiro" : `${e.horaInicio}${e.horaFim ? `–${e.horaFim}` : ""}`}`;

/**
 * O FORMULÁRIO de um evento (o bloco "Eventos" da tarefa e o "Criar"/"Editar" do Calendário): título, data e data FINAL
 * (vários dias), DIA INTEIRO ou início/fim, LEMBRETE (no sino), local, descrição e a cor (sem cor própria = a do quadro).
 * Controlado — quem usa grava.
 */
export function EditorEvento({ valor, onChange, disabled = false }: { valor: RascunhoEvento; onChange: (v: RascunhoEvento) => void; disabled?: boolean }) {
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
      <SelectField label="Lembrete (no sino)" value={valor.lembrete} disabled={disabled} onChange={(e) => set("lembrete", e.target.value)}>
        <option value="">Sem lembrete</option>
        {OPCOES_LEMBRETE.map((o) => (
          <option key={o.min} value={String(o.min)}>
            {o.rotulo}
          </option>
        ))}
      </SelectField>
      <TextField label="Local (opcional)" value={valor.local} maxLength={120} disabled={disabled} onChange={(e) => set("local", e.target.value)} />
      <TextArea label="Descrição (opcional)" rows={3} value={valor.descricao} maxLength={2000} disabled={disabled} onChange={(e) => set("descricao", e.target.value)} />
      <div className="space-y-2">
        <Switch checked={valor.cor != null} disabled={disabled} onChange={(v) => set("cor", v ? "#2563eb" : null)} label="Cor própria (sem ela, a cor do quadro)" />
        {valor.cor != null && <ColorField label="Cor do evento" value={valor.cor} onChange={(c) => set("cor", c)} />}
      </div>
    </div>
  );
}

/**
 * O bloco "EVENTOS" da tarefa: a lista (em ordem de data — data, horário, local e a cor) com editar/excluir e "Adicionar
 * evento" (o `EditorEvento` em linha). Só apresenta — quem usa grava (`onSalvar(id|null, dados)` / `onExcluir`): na tarefa
 * gravada, na hora; na tarefa nova, no rascunho. `ocupado` = uma gravação em curso.
 */
export function EventosTarefa({
  eventos,
  hoje,
  onSalvar,
  onExcluir,
  disabled = false,
  ocupado = false,
}: {
  eventos: (DadosEvento & { id: number })[];
  hoje: string;
  onSalvar: (id: number | null, dados: DadosEvento) => Promise<boolean>;
  onExcluir: (e: DadosEvento & { id: number }) => void;
  disabled?: boolean;
  ocupado?: boolean;
}) {
  const [editando, setEditando] = useState<{ id: number | null; r: RascunhoEvento } | null>(null);
  const ordenados = [...eventos].sort((a, b) => a.data.localeCompare(b.data) || (a.horaInicio ?? "").localeCompare(b.horaInicio ?? ""));
  const salvar = async () => {
    if (!editando || Object.keys(problemasEvento(editando.r)).length) return;
    if (await onSalvar(editando.id, dadosDoEvento(editando.r))) setEditando(null);
  };
  const form = editando && (
    <div className="space-y-3 rounded-card border border-accent/40 bg-surface p-3">
      <EditorEvento valor={editando.r} onChange={(r) => setEditando({ ...editando, r })} disabled={ocupado} />
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
                  </p>
                  <p className="flex flex-wrap items-center gap-x-2 text-[11.5px] text-muted">
                    <span className="inline-flex items-center gap-1">
                      {e.diaInteiro ? <IconCalendar className="h-3 w-3" /> : <IconClock className="h-3 w-3" />}
                      {rotuloData(e.data, hoje)}
                      {e.dataFim && e.dataFim > e.data ? ` → ${rotuloData(e.dataFim, hoje)}` : ""} · {e.diaInteiro || !e.horaInicio ? "dia inteiro" : `${e.horaInicio}${e.horaFim ? `–${e.horaFim}` : ""}`}
                    </span>
                    {e.lembreteMin != null && (
                      <span className="inline-flex items-center gap-1" title={rotuloLembrete(e.lembreteMin)}>
                        <IconBell className="h-3 w-3" />
                        {rotuloLembrete(e.lembreteMin)}
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
        <Button variant="ghost" size="sm" icon={<IconPlus className="h-4 w-4" />} onClick={() => setEditando({ id: null, r: rascunhoEvento({ data: hoje }) })}>
          Adicionar evento
        </Button>
      )}
      {disabled && !ordenados.length && <p className="text-[12.5px] text-muted">Sem eventos.</p>}
    </div>
  );
}
