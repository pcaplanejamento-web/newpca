"use client";

import type { ReactNode } from "react";
import { brl, dataBR, num } from "@/lib/format";
import { valoresBatem } from "@/lib/normalize";
import { tipoCurtoDfd } from "@/lib/parse-dfd-comum";
import { Callout } from "./Callout";
import { TextField } from "./Field";
import { inputCls, labelCls } from "./formStyles";
import { IconAlert } from "./icons";
import { type LinhaDfd, PlanilhaDfds } from "./PlanilhaDfds";
import { StatMini } from "./StatMini";

/** Campos da CAPA do protocolo (a MESMA grade na importação e no gravado). Id/Valor/Local
 * são sempre só-leitura; os demais ficam só-leitura salvo `editavel` (criação manual). O
 * controle de repartição entra por `children` (varia: obrigatório no import, cadeado no gravado). */
export type CampoCapa = "numero" | "data" | "documento" | "interessado" | "assunto" | "observacao";
export function CapaCampos({
  numero,
  idExterno,
  data,
  documento,
  interessado,
  assunto,
  observacao,
  valorCapa,
  localReparticao,
  editavel = false,
  onChange,
  children,
}: {
  numero: string;
  idExterno: string | null;
  data: string;
  documento: string;
  interessado: string;
  assunto: string;
  observacao: string;
  valorCapa: number | null;
  localReparticao: string | null;
  editavel?: boolean;
  onChange?: (campo: CampoCapa, valor: string) => void;
  children?: ReactNode;
}) {
  const ro = !editavel;
  const set = (c: CampoCapa) => (e: { target: { value: string } }) => onChange?.(c, e.target.value);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <TextField label="Número do processo" value={numero} onChange={set("numero")} disabled={ro} readOnly={ro} placeholder="Ex.: 144756/2026" />
      <TextField label="Id do processo" value={idExterno ?? ""} disabled readOnly placeholder="—" />
      <TextField label="Data/Hora" value={data} onChange={set("data")} disabled={ro} readOnly={ro} placeholder="—" />
      <TextField label="CPF/CNPJ" value={documento} onChange={set("documento")} disabled={ro} readOnly={ro} placeholder="—" />
      <div className="sm:col-span-2">
        <TextField label="Interessado" value={interessado} onChange={set("interessado")} disabled={ro} readOnly={ro} />
      </div>
      <TextField label="Assunto" value={assunto} onChange={set("assunto")} disabled={ro} readOnly={ro} />
      <TextField label="Observação" value={observacao} onChange={set("observacao")} disabled={ro} readOnly={ro} />
      <TextField label="Valor (capa)" value={valorCapa != null ? brl(valorCapa) : "—"} disabled readOnly />
      <TextField label="Local (capa)" value={localReparticao ?? ""} disabled readOnly placeholder="—" />
      {children}
    </div>
  );
}

/**
 * Campo editável do protocolo (banner destravado). Os DADOS DA CAPA são IMUTÁVEIS
 * (nunca editáveis) — só a **repartição** (roteamento/escopo, não é dado da capa)
 * pode ser ajustada.
 */
export type ProtocoloEdicaoValores = {
  reparticaoId: number | null;
};
export type ProtocoloEdicao = {
  trancado: boolean;
  reparticoes: { id: number; codigo: string; nome: string }[];
  valores: ProtocoloEdicaoValores;
  onChange: (patch: Partial<ProtocoloEdicaoValores>) => void;
};

/**
 * Visão COMPLETA (read-only) do protocolo — metadados da capa + a lista dos DFDs
 * que ele reúne. Componente presentacional (forma estrutural satisfeita por
 * `ProtocoloDetalhe`); o "Ver" de cada DFD é delegado via `onVerDfd` (opcional,
 * para catalogar com mock sem buscar dados).
 */
export type ProtocoloVisualDfd = {
  id: number;
  numero: string;
  planejamento: string | null;
  tipo: string | null;
  setorRequisitante: string | null;
  reparticaoCodigo: string | null;
  totalItens: number | null;
  valorTotal: number | null;
  valorEstimado: number | null;
};

export type ProtocoloVisual = {
  numero: string;
  idExterno: string | null;
  anoPca: number | null;
  data: string | null;
  interessado: string | null;
  documento: string | null;
  assunto: string | null;
  observacao: string | null;
  localReparticao: string | null;
  valorCapa: number | null;
  reparticaoCodigo: string | null;
  reparticaoNome: string | null;
  criadoEm?: string | null;
  totalDfds: number;
  totalItens: number;
  valorTotal: number;
  dfds: ProtocoloVisualDfd[];
};

const valorDfd = (d: ProtocoloVisualDfd) => d.valorTotal ?? d.valorEstimado ?? 0;

/**
 * Cabeçalho FIXO do banner do protocolo (topo do `Modal`, não o corpo): nº do processo +
 * as infos mais importantes ao lado — **Id do protocolo** e **Assunto** (trunca no mobile).
 */
export function ProtocoloCabecalho({
  numero,
  idExterno,
  assunto,
}: {
  numero: string;
  idExterno: string | null;
  assunto: string | null;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 overflow-hidden">
      <span className="shrink-0 text-base font-bold text-text">Protocolo {numero}</span>
      {idExterno && (
        <span className="shrink-0 rounded-control bg-accent-soft px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-accent">
          Id {idExterno}
        </span>
      )}
      {assunto && <span className="truncate text-[12.5px] text-muted">{assunto}</span>}
    </div>
  );
}

export function ProtocoloView({
  protocolo,
  onVerDfd,
  edicao,
}: {
  protocolo: ProtocoloVisual;
  onVerDfd?: (id: number) => void;
  edicao?: ProtocoloEdicao;
}) {
  const editando = !!edicao && !edicao.trancado;
  const rep =
    protocolo.reparticaoCodigo || protocolo.reparticaoNome
      ? `${protocolo.reparticaoCodigo ?? ""}${protocolo.reparticaoNome ? ` · ${protocolo.reparticaoNome}` : ""}`
      : "Sem repartição";
  // Valor da capa × somatória dos valores dos DFDs (o valor de cada DFD é a soma dos
  // seus itens). A capa é imutável; aqui a divergência é só APONTADA (a conciliação
  // acontece uma única vez, na importação, antes de gravar).
  const capaDivergente = protocolo.valorCapa != null && !valoresBatem(protocolo.valorCapa, protocolo.valorTotal);

  // Planilha ÚNICA de DFDs (a mesma da importação e da aba DFDs). Um DFD gravado já
  // passou pela validação → estado "regular" (sem tabela de erro).
  const linhasDfd: LinhaDfd[] = protocolo.dfds.map((d) => ({
    key: d.id,
    numero: d.numero,
    planejamento: d.planejamento,
    sigla: d.reparticaoCodigo ?? "—",
    tipo: tipoCurtoDfd(d.tipo),
    itens: d.totalItens,
    valor: valorDfd(d),
    estado: "regular",
  }));

  return (
    <div className="space-y-5">
      {/* O nº/Id/Assunto do processo ficam no cabeçalho FIXO do banner (`ProtocoloCabecalho`),
          não aqui. Nas telas soltas (catálogo) o `ProtocoloCabecalho` é renderizado acima. */}

      {/* Head — mini banners (um por informação): total de DFDs + somatória dos valores.
          2-up no mobile (a somatória em R$ cabe inteira) → 3-up a partir de sm. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatMini label="Total de DFDs" value={num(protocolo.totalDfds)} />
        <StatMini label="Total de itens" value={num(protocolo.totalItens)} />
        <StatMini
          label="Somatória dos DFDs"
          value={brl(protocolo.valorTotal)}
          tone={capaDivergente ? "warn" : "default"}
          className="col-span-2 sm:col-span-1"
        />
      </div>

      {capaDivergente && (
        <Callout kind="warn" icon={<IconAlert className="h-5 w-5" />}>
          <p className="font-semibold">O valor da capa diverge da somatória dos DFDs</p>
          <p className="mt-1 opacity-90">
            Valor da capa: {brl(protocolo.valorCapa)} · Somatória dos DFDs: {brl(protocolo.valorTotal)}.
          </p>
        </Callout>
      )}

      {/* Dados da capa — MESMA grade (`CapaCampos`) da importação, SEMPRE só-leitura
          (imutáveis). Só a repartição (roteamento) vira um seletor quando destravado. */}
      <section className="rounded-card border border-border bg-surface p-5 shadow-ring">
        <h3 className="mb-4 text-sm font-bold text-text">Dados do processo</h3>
        <CapaCampos
          numero={protocolo.numero}
          idExterno={protocolo.idExterno}
          data={protocolo.data ?? ""}
          documento={protocolo.documento ?? ""}
          interessado={protocolo.interessado ?? ""}
          assunto={protocolo.assunto ?? ""}
          observacao={protocolo.observacao ?? ""}
          valorCapa={protocolo.valorCapa}
          localReparticao={protocolo.localReparticao}
          editavel={false}
        >
          <div>
            <TextField label="PCA (ano)" value={protocolo.anoPca != null ? String(protocolo.anoPca) : "—"} disabled readOnly />
          </div>
          {editando && edicao ? (
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="proto-edit-rep">
                Repartição
              </label>
              <select
                id="proto-edit-rep"
                className={inputCls}
                value={edicao.valores.reparticaoId ?? ""}
                onChange={(e) => edicao.onChange({ reparticaoId: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">— Selecione a repartição —</option>
                {edicao.reparticoes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.codigo} · {r.nome}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="sm:col-span-2">
              <TextField label="Repartição" value={rep} disabled readOnly />
            </div>
          )}
        </CapaCampos>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-bold text-text">DFDs do protocolo ({protocolo.dfds.length})</h3>
        {protocolo.dfds.length === 0 ? (
          <p className="rounded-card border border-border bg-surface p-6 text-center text-sm text-muted">
            Nenhum DFD vinculado a este protocolo ainda.
          </p>
        ) : (
          <PlanilhaDfds linhas={linhasDfd} onRowClick={onVerDfd} />
        )}
      </section>

      {protocolo.criadoEm && (
        <p className="text-[11px] text-faint">Protocolado em {dataBR(protocolo.criadoEm)}.</p>
      )}
    </div>
  );
}


