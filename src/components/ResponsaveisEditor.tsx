"use client";

import {
  type EstadoTemporario,
  estadoTemporario,
  hojeISO,
  type Responsaveis,
  temporarioVigente,
} from "@/lib/reparticao-responsaveis";
import { Button } from "./Button";
import { TextField } from "./Field";
import { IconPlus, IconTrash } from "./icons";

const ROTULO: Record<EstadoTemporario, string> = {
  agendado: "Agendado",
  vigente: "Vigente",
  encerrado: "Encerrado",
};
const COR: Record<EstadoTemporario, string> = {
  agendado: "var(--info)",
  vigente: "var(--ok)",
  encerrado: "var(--muted)",
};

/**
 * Editor de responsáveis por DFDs de uma repartição: **1 padrão** + **N temporários**
 * (período + portaria/decreto). Durante o período de um temporário, ELE é o efetivo — o
 * padrão fica **em cinza** e o temporário vigente é destacado; temporários fora do período
 * (agendados/encerrados) ficam em cinza. Só componentes do DS. Controlado.
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
  const padraoInativo = temporarioVigente(valor, hoje) != null;

  const setTemp = (i: number, patch: Partial<Responsaveis["temporarios"][number]>) =>
    onChange({ ...valor, temporarios: valor.temporarios.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const addTemp = () =>
    onChange({ ...valor, temporarios: [...valor.temporarios, { nome: "", inicio: "", fim: "", ato: null }] });
  const remTemp = (i: number) =>
    onChange({ ...valor, temporarios: valor.temporarios.filter((_, j) => j !== i) });

  return (
    <div className="space-y-4">
      {/* Responsável PADRÃO */}
      <div className={padraoInativo ? "opacity-60" : ""}>
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-medium text-text-2">Responsável padrão</span>
          <span
            className="text-[10px] font-semibold uppercase"
            style={{ color: padraoInativo ? "var(--muted)" : "var(--ok)" }}
          >
            {padraoInativo ? "Inativo · temporário no comando" : "Responsável atual"}
          </span>
        </div>
        <TextField
          aria-label="Responsável padrão"
          value={valor.padrao}
          onChange={(e) => onChange({ ...valor, padrao: e.target.value })}
          placeholder="Nome do responsável padrão"
          disabled={disabled}
        />
      </div>

      {/* Responsáveis TEMPORÁRIOS */}
      <div className="space-y-2">
        <span className="block text-[13px] font-medium text-text-2">Responsáveis temporários</span>
        {valor.temporarios.length === 0 && (
          <p className="text-[12px] text-faint">
            Nenhum temporário. No período de um temporário, ele assume no lugar do padrão.
          </p>
        )}
        {valor.temporarios.map((t, i) => {
          const completo = Boolean(t.inicio && t.fim);
          const est = estadoTemporario(t, hoje);
          const vigente = est === "vigente" && Boolean(t.nome);
          return (
            // Lista controlada (o valor vem sempre das props) — índice como key é seguro aqui.
            <div
              key={i}
              className={`rounded-card border p-3 ${vigente ? "border-accent shadow-ring" : "border-border opacity-70"}`}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase" style={{ color: completo ? COR[est] : "var(--muted)" }}>
                  {completo ? ROTULO[est] : "Datas pendentes"}
                </span>
                <Button
                  variant="ghost"
                  aria-label={`Remover temporário ${i + 1}`}
                  onClick={() => remTemp(i)}
                  disabled={disabled}
                  icon={<IconTrash className="h-4 w-4" />}
                  style={{ color: "var(--danger)" }}
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <TextField
                    label="Nome"
                    value={t.nome}
                    onChange={(e) => setTemp(i, { nome: e.target.value })}
                    placeholder="Nome do responsável temporário"
                    disabled={disabled}
                  />
                </div>
                <TextField label="Início" type="date" value={t.inicio} onChange={(e) => setTemp(i, { inicio: e.target.value })} disabled={disabled} />
                <TextField label="Fim" type="date" value={t.fim} onChange={(e) => setTemp(i, { fim: e.target.value })} disabled={disabled} />
                <div className="sm:col-span-2">
                  <TextField
                    label="Portaria/Decreto (opcional)"
                    value={t.ato ?? ""}
                    onChange={(e) => setTemp(i, { ato: e.target.value || null })}
                    placeholder="Ex.: Portaria 123/2026"
                    disabled={disabled}
                  />
                </div>
              </div>
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
