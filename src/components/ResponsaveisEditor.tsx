"use client";

import { useId } from "react";
import {
  type EstadoTemporario,
  estadoTemporario,
  hojeISO,
  type Nomeacao,
  novoResponsavel,
  novoTemporario,
  padroesInativos,
  type Responsavel,
  type Responsaveis,
  TIPOS_ATO,
} from "@/lib/reparticao-responsaveis";
import { Button } from "./Button";
import { TextField } from "./Field";
import { inputCls, labelCls } from "./formStyles";
import { IconPlus, IconTrash } from "./icons";

const ROTULO: Record<EstadoTemporario, string> = { agendado: "Agendado", vigente: "Vigente", encerrado: "Encerrado" };
const COR: Record<EstadoTemporario, string> = {
  agendado: "var(--info)",
  vigente: "var(--ok)",
  encerrado: "var(--muted)",
};

/** Campos de UM responsável: nome, matrícula, função e a nomeação (ato + número + link). */
function CamposResponsavel({
  resp,
  onChange,
  disabled,
}: {
  resp: Responsavel;
  onChange: (patch: Partial<Responsavel>) => void;
  disabled?: boolean;
}) {
  const idAto = useId();
  const setNom = (patch: Partial<Nomeacao>) => onChange({ nomeacao: { ...resp.nomeacao, ...patch } });
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <TextField label="Nome" value={resp.nome} onChange={(e) => onChange({ nome: e.target.value })} placeholder="Nome do responsável" disabled={disabled} />
      </div>
      <TextField label="Matrícula" value={resp.matricula} onChange={(e) => onChange({ matricula: e.target.value })} placeholder="Ex.: 12345" disabled={disabled} />
      <TextField label="Função" value={resp.funcao} onChange={(e) => onChange({ funcao: e.target.value })} placeholder="Ex.: Secretário(a)" disabled={disabled} />
      <div>
        <label className={labelCls} htmlFor={idAto}>
          Ato de nomeação
        </label>
        <select
          id={idAto}
          className={inputCls}
          value={resp.nomeacao.tipo ?? ""}
          onChange={(e) => setNom({ tipo: (e.target.value || null) as Nomeacao["tipo"] })}
          disabled={disabled}
        >
          <option value="">— Sem ato —</option>
          {TIPOS_ATO.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.rotulo}
            </option>
          ))}
        </select>
      </div>
      {resp.nomeacao.tipo && (
        <TextField label="Número / identificação" value={resp.nomeacao.numero} onChange={(e) => setNom({ numero: e.target.value })} placeholder="Ex.: 123/2026" disabled={disabled} />
      )}
      {resp.nomeacao.tipo && (
        <div className="sm:col-span-2">
          <TextField label="Link do ato" type="url" value={resp.nomeacao.link} onChange={(e) => setNom({ link: e.target.value })} placeholder="https://..." disabled={disabled} />
        </div>
      )}
    </div>
  );
}

/**
 * Editor de responsáveis por DFDs: **N padrões** + **N temporários** (com período). Todo
 * responsável tem nome/matrícula/função + nomeação (portaria/decreto/lei, número e link).
 * No período de um temporário, ele é o efetivo — os padrões ficam **em cinza**; temporários
 * fora do período (agendados/encerrados) também ficam em cinza. Só componentes do DS.
 */
export function ResponsaveisEditor({
  valor,
  onChange,
  disabled = false,
}: {
  valor: Responsaveis;
  onChange: (r: Responsaveis) => void;
  disabled?: boolean;
}) {
  const hoje = hojeISO();
  const padraoInativo = padroesInativos(valor, hoje);

  const setPadrao = (i: number, patch: Partial<Responsavel>) =>
    onChange({ ...valor, padroes: valor.padroes.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const addPadrao = () => onChange({ ...valor, padroes: [...valor.padroes, novoResponsavel()] });
  const remPadrao = (i: number) => onChange({ ...valor, padroes: valor.padroes.filter((_, j) => j !== i) });

  const setTemp = (i: number, patch: Partial<Responsaveis["temporarios"][number]>) =>
    onChange({ ...valor, temporarios: valor.temporarios.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const addTemp = () => onChange({ ...valor, temporarios: [...valor.temporarios, novoTemporario()] });
  const remTemp = (i: number) => onChange({ ...valor, temporarios: valor.temporarios.filter((_, j) => j !== i) });

  return (
    <div className="space-y-[var(--gap-block)]">
      {/* Responsáveis PADRÃO (podem ser vários) */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-medium text-text-2">Responsáveis padrão</span>
          <span
            className="text-[10px] font-semibold uppercase"
            style={{ color: padraoInativo ? "var(--muted)" : "var(--ok)" }}
          >
            {padraoInativo ? "Inativos · temporário no comando" : "Responsáveis atuais"}
          </span>
        </div>
        {valor.padroes.length === 0 && <p className="text-[12px] text-faint">Nenhum responsável padrão.</p>}
        {valor.padroes.map((p, i) => (
          // Lista controlada (valor sempre das props) — índice como key é seguro aqui.
          <div key={i} className={`rounded-card border border-border p-3 ${padraoInativo ? "opacity-60" : ""}`}>
            <div className="mb-2 flex justify-end">
              <Button variant="ghost" aria-label={`Remover padrão ${i + 1}`} onClick={() => remPadrao(i)} disabled={disabled} icon={<IconTrash className="h-4 w-4" />} style={{ color: "var(--danger)" }} />
            </div>
            <CamposResponsavel resp={p} onChange={(patch) => setPadrao(i, patch)} disabled={disabled} />
          </div>
        ))}
        <Button variant="secondary" onClick={addPadrao} disabled={disabled} icon={<IconPlus className="h-[18px] w-[18px]" />}>
          Adicionar padrão
        </Button>
      </div>

      {/* Responsáveis TEMPORÁRIOS (com período) */}
      <div className="space-y-2 border-t border-border pt-4">
        <span className="block text-[13px] font-medium text-text-2">Responsáveis temporários</span>
        {valor.temporarios.length === 0 && (
          <p className="text-[12px] text-faint">
            Nenhum temporário. No período de um temporário, ele assume no lugar dos padrões.
          </p>
        )}
        {valor.temporarios.map((t, i) => {
          const completo = Boolean(t.inicio && t.fim);
          const est = estadoTemporario(t, hoje);
          const vigente = est === "vigente" && Boolean(t.nome);
          return (
            <div key={i} className={`rounded-card border p-3 ${vigente ? "border-accent shadow-ring" : "border-border opacity-70"}`}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase" style={{ color: completo ? COR[est] : "var(--muted)" }}>
                  {completo ? ROTULO[est] : "Datas pendentes"}
                </span>
                <Button variant="ghost" aria-label={`Remover temporário ${i + 1}`} onClick={() => remTemp(i)} disabled={disabled} icon={<IconTrash className="h-4 w-4" />} style={{ color: "var(--danger)" }} />
              </div>
              <div className="mb-2 grid gap-2 sm:grid-cols-2">
                <TextField label="Início" type="date" value={t.inicio} onChange={(e) => setTemp(i, { inicio: e.target.value })} disabled={disabled} />
                <TextField label="Fim" type="date" value={t.fim} onChange={(e) => setTemp(i, { fim: e.target.value })} disabled={disabled} />
              </div>
              <CamposResponsavel resp={t} onChange={(patch) => setTemp(i, patch)} disabled={disabled} />
            </div>
          );
        })}
        <Button variant="secondary" onClick={addTemp} disabled={disabled} icon={<IconPlus className="h-[18px] w-[18px]" />}>
          Adicionar temporário
        </Button>
      </div>
    </div>
  );
}
