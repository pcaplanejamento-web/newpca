"use client";

import { useEffect, useState } from "react";
import type { OpcoesPorCampo } from "@/lib/protocolos";
import type { CampoOpcao, SituacaoProtocolo } from "@/db/schema";
import type { ProtocoloLista } from "@/lib/protocolos";
import { IconAlert, IconClose, IconPlus, IconSpinner } from "./icons";

export type SituacaoOpcao = { valor: SituacaoProtocolo; label: string };

type FormState = {
  numero: string;
  data: string;
  orgao: string;
  orgaoSigla: string;
  natureza: string;
  responsavel: string;
  situacao: SituacaoProtocolo;
  distribuicao: string;
};

const hoje = () => new Date().toISOString().slice(0, 10);

function estadoInicial(p?: ProtocoloLista | null): FormState {
  return {
    numero: p?.numero ?? "",
    data: p?.data ?? hoje(),
    orgao: p?.orgao ?? "",
    orgaoSigla: p?.orgaoSigla ?? "",
    natureza: p?.natureza ?? "",
    responsavel: p?.responsavel ?? "",
    situacao: p?.situacao ?? "em_analise",
    distribuicao: p?.distribuicao ?? "",
  };
}

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:focus:ring-emerald-500/20";

const labelCls =
  "mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300";

/** <select> de opção gerenciável + "adicionar nova opção" inline. */
function CampoSelecao({
  label,
  campo,
  valor,
  opcoes,
  onChange,
  onNovaOpcao,
  podeEditar,
  placeholder = "Selecione...",
}: {
  label: string;
  campo: CampoOpcao;
  valor: string;
  opcoes: string[];
  onChange: (v: string) => void;
  onNovaOpcao: (campo: CampoOpcao, valor: string) => Promise<boolean>;
  podeEditar: boolean;
  placeholder?: string;
}) {
  const [adicionando, setAdicionando] = useState(false);
  const [nova, setNova] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function confirmar() {
    const v = nova.trim();
    if (!v) return;
    setSalvando(true);
    const ok = await onNovaOpcao(campo, v);
    setSalvando(false);
    if (ok) {
      onChange(v);
      setNova("");
      setAdicionando(false);
    }
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className={labelCls + " mb-0"}>{label}</span>
        {podeEditar && !adicionando && (
          <button
            type="button"
            onClick={() => setAdicionando(true)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
          >
            <IconPlus className="h-3 w-3" /> Nova opção
          </button>
        )}
      </div>
      {adicionando ? (
        <div className="flex gap-2">
          <input
            autoFocus
            value={nova}
            onChange={(e) => setNova(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                confirmar();
              }
              if (e.key === "Escape") setAdicionando(false);
            }}
            placeholder={`Nova ${label.toLowerCase()}`}
            className={inputCls}
          />
          <button
            type="button"
            onClick={confirmar}
            disabled={salvando || !nova.trim()}
            className="shrink-0 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {salvando ? <IconSpinner className="h-4 w-4" /> : "Add"}
          </button>
          <button
            type="button"
            onClick={() => setAdicionando(false)}
            className="shrink-0 rounded-lg border border-slate-200 px-3 text-sm text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <select
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          className={inputCls}
        >
          <option value="">{placeholder}</option>
          {opcoes.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
          {valor && !opcoes.includes(valor) && <option value={valor}>{valor}</option>}
        </select>
      )}
    </div>
  );
}

export function NovoProtocoloModal({
  aberto,
  aoFechar,
  opcoes,
  situacoes,
  protocolo,
  podeEditar,
  aoSalvar,
  aoAdicionarOpcao,
}: {
  aberto: boolean;
  aoFechar: () => void;
  opcoes: OpcoesPorCampo;
  situacoes: SituacaoOpcao[];
  protocolo?: ProtocoloLista | null;
  podeEditar: boolean;
  aoSalvar: () => void;
  aoAdicionarOpcao: (campo: CampoOpcao, valor: string) => Promise<boolean>;
}) {
  const [form, setForm] = useState<FormState>(estadoInicial(protocolo));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Recarrega o formulário sempre que abrir (novo) ou trocar o protocolo (editar).
  useEffect(() => {
    if (aberto) {
      setForm(estadoInicial(protocolo));
      setErro(null);
    }
  }, [aberto, protocolo]);

  if (!aberto) return null;

  const editando = !!protocolo;
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function salvar() {
    if (!form.numero.trim()) {
      setErro("Informe o número do protocolo.");
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const url = editando ? `/api/protocolos/${protocolo!.id}` : "/api/protocolos";
      const res = await fetch(url, {
        method: editando ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Erro ao salvar.");
      aoSalvar();
      aoFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={aoFechar} />
      <div className="relative flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:max-w-lg sm:rounded-2xl dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h3 className="text-base font-bold text-slate-800 dark:text-white">
            {editando ? "Editar protocolo" : "Novo protocolo"}
          </h3>
          <button
            type="button"
            aria-label="Fechar"
            onClick={aoFechar}
            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <IconClose className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="p-numero">
                Protocolo *
              </label>
              <input
                id="p-numero"
                value={form.numero}
                onChange={(e) => set("numero", e.target.value)}
                placeholder="Ex.: 2024.0001234"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="p-data">
                Data
              </label>
              <input
                id="p-data"
                type="date"
                value={form.data}
                onChange={(e) => set("data", e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          <CampoSelecao
            label="Secretaria / Órgão"
            campo="orgao"
            valor={form.orgao}
            opcoes={opcoes.orgao}
            onChange={(v) => set("orgao", v)}
            onNovaOpcao={aoAdicionarOpcao}
            podeEditar={podeEditar}
          />

          <div>
            <label className={labelCls} htmlFor="p-sigla">
              Sigla do órgão
            </label>
            <input
              id="p-sigla"
              value={form.orgaoSigla}
              onChange={(e) => set("orgaoSigla", e.target.value)}
              placeholder="Ex.: SMS"
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CampoSelecao
              label="Natureza"
              campo="natureza"
              valor={form.natureza}
              opcoes={opcoes.natureza}
              onChange={(v) => set("natureza", v)}
              onNovaOpcao={aoAdicionarOpcao}
              podeEditar={podeEditar}
            />
            <CampoSelecao
              label="Responsável"
              campo="responsavel"
              valor={form.responsavel}
              opcoes={opcoes.responsavel}
              onChange={(v) => set("responsavel", v)}
              onNovaOpcao={aoAdicionarOpcao}
              podeEditar={podeEditar}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="p-situacao">
                Situação
              </label>
              <select
                id="p-situacao"
                value={form.situacao}
                onChange={(e) => set("situacao", e.target.value as SituacaoProtocolo)}
                className={inputCls}
              >
                {situacoes.map((s) => (
                  <option key={s.valor} value={s.valor}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <CampoSelecao
              label="Distribuição"
              campo="distribuicao"
              valor={form.distribuicao}
              opcoes={opcoes.distribuicao}
              onChange={(v) => set("distribuicao", v)}
              onNovaOpcao={aoAdicionarOpcao}
              podeEditar={podeEditar}
            />
          </div>

          {erro && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
              {erro}
            </div>
          )}
        </div>

        <div className="flex gap-3 border-t border-slate-200 px-5 py-4 dark:border-slate-800">
          <button
            type="button"
            onClick={salvar}
            disabled={salvando}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {salvando ? <IconSpinner className="h-[18px] w-[18px]" /> : null}
            {editando ? "Salvar alterações" : "Criar protocolo"}
          </button>
          <button
            type="button"
            onClick={aoFechar}
            disabled={salvando}
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
