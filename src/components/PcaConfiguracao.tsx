"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { FontePca, StatusPca } from "@/lib/pca-core";
import { AvisoFlutuante } from "./AvisoFlutuante";
import { Button } from "./Button";
import { TextField } from "./Field";
import { selectCls } from "./formStyles";
import { IconCheck, IconImage, IconLock, IconTrash } from "./icons";
import { PcaCapa } from "./PcaCard";
import { RecorteImagem } from "./RecorteImagem";
import { Switch } from "./Switch";

export type ConfigPca = {
  id: number;
  nome: string;
  ano: number | null;
  fonte: FontePca;
  status: StatusPca;
  capa: string | null;
  orcamentoVisaoId: number | null;
};

const CARTAO = "rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring";

/** Cartão-rádio da FONTE dos dados. */
function OpcaoFonte({
  ativo,
  titulo,
  texto,
  onClick,
  disabled,
}: {
  ativo: boolean;
  titulo: string;
  texto: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      disabled={disabled && !ativo}
      onClick={onClick}
      className={`flex min-h-[44px] flex-col items-start gap-1 rounded-card border-2 p-4 text-left transition-colors disabled:opacity-50 ${
        ativo ? "border-accent bg-accent-soft/60" : "border-border bg-surface hover:border-accent/40"
      }`}
    >
      <span className="flex items-center gap-2 font-bold text-text">
        <span className={`grid h-5 w-5 place-items-center rounded-full border-2 ${ativo ? "border-accent" : "border-border-2"}`}>
          {ativo && <span className="h-2.5 w-2.5 rounded-full bg-accent" />}
        </span>
        {titulo}
      </span>
      <span className="text-sm text-muted">{texto}</span>
    </button>
  );
}

/**
 * Aba CONFIGURAÇÃO do PCA: Identificação (nome/ano) · Fonte dos dados (travada quando já há dados) ·
 * Publicar na tela inicial · Travas para mover protocolos (as situações que permitem) · Visão do
 * orçamento · Capa do card (recorte 4:5 → WebP 800×1000).
 */
export function PcaConfiguracao({
  pca,
  podeEditar,
  temDados,
  visoes,
}: {
  pca: ConfigPca;
  podeEditar: boolean;
  /** Descrição dos dados que TRAVAM a troca de fonte (ex.: "3 planilha(s)"); `null` = livre. */
  temDados: string | null;
  visoes: { id: number; nome: string; resumo: string }[];
}) {
  const router = useRouter();
  const [nome, setNome] = useState(pca.nome);
  const [ano, setAno] = useState(pca.ano != null ? String(pca.ano) : "");
  const [salvando, setSalvando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ kind: "ok" | "danger"; texto: string } | null>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function salvar(campos: Partial<ConfigPca>, chave: string, ok?: string) {
    setSalvando(chave);
    try {
      const r = await fetch(`/api/pca/${pca.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(campos) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Não foi possível salvar.");
      if (ok) setAviso({ kind: "ok", texto: ok });
      router.refresh();
      return true;
    } catch (e) {
      setAviso({ kind: "danger", texto: e instanceof Error ? e.message : "Não foi possível salvar." });
      return false;
    } finally {
      setSalvando(null);
    }
  }

  async function excluirPca() {
    const extra = temDados ? ` Ele tem ${temDados}${pca.fonte === "lista" ? " — as planilhas e os itens são excluídos junto" : " — os DFDs continuam na Mesa, só saem do PCA"}.` : "";
    if (!confirm(`Excluir o ${pca.nome}?${extra}`)) return;
    setSalvando("excluir");
    const r = await fetch(`/api/pca/${pca.id}`, { method: "DELETE" });
    if (r.ok) {
      router.push("/painel/pca");
      return;
    }
    setSalvando(null);
    setAviso({ kind: "danger", texto: "Não foi possível excluir o PCA." });
  }

  const anoN = Number(ano);
  const anoValido = /^\d{4}$/.test(ano) && anoN >= 2000 && anoN <= 2100;
  const mudouId = nome.trim() !== pca.nome || (anoValido && anoN !== pca.ano);
  const ro = !podeEditar;

  return (
    <div className="grid grid-cols-1 gap-[var(--gap-block)] lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
      <div className="space-y-[var(--gap-block)]">
        <section className={CARTAO}>
          <h2 className="mb-3 font-bold text-text">Identificação</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_160px]">
            <TextField label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} disabled={ro} />
            <TextField
              label="Ano"
              inputMode="numeric"
              value={ano}
              onChange={(e) => setAno(e.target.value.replace(/\D/g, "").slice(0, 4))}
              error={ano && !anoValido ? "Ano inválido" : undefined}
              disabled={ro}
            />
          </div>
          {podeEditar && (
            <div className="mt-3 flex justify-end">
              <Button
                disabled={!mudouId || !anoValido || !nome.trim()}
                loading={salvando === "id"}
                onClick={() => salvar({ nome: nome.trim(), ano: anoN }, "id", "Identificação salva.")}
              >
                Salvar
              </Button>
            </div>
          )}
        </section>

        <section className={CARTAO}>
          <h2 className="mb-3 font-bold text-text">Fonte dos dados</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <OpcaoFonte
              ativo={pca.fonte === "lista"}
              titulo="Lista pronta"
              texto="Importa planilhas (modelo atual). Aba Importação."
              disabled={ro || !!temDados || salvando != null}
              onClick={() => pca.fonte !== "lista" && salvar({ fonte: "lista" }, "fonte")}
            />
            <OpcaoFonte
              ativo={pca.fonte === "protocolo"}
              titulo="Protocolos"
              texto="Só os DFDs dos protocolos movidos da Mesa. Aba Mesa."
              disabled={ro || !!temDados || salvando != null}
              onClick={() => pca.fonte !== "protocolo" && salvar({ fonte: "protocolo" }, "fonte")}
            />
          </div>
          {temDados && (
            <p className="mt-3 flex items-center gap-2 text-sm text-muted">
              <IconLock className="h-4 w-4 shrink-0" /> Troca bloqueada: o PCA já tem {temDados}.
            </p>
          )}
        </section>

        <section className={`${CARTAO} flex flex-wrap items-center justify-between gap-3`}>
          <div>
            <h2 className="font-bold text-text">Publicar na tela inicial</h2>
            <p className="text-sm text-muted">
              {pca.status === "publicado"
                ? "Publicado. Disponível no seletor de PCA da tela inicial — com o MESMO Dashboard do painel."
                : "Em Preview. Visível só no painel."}
            </p>
          </div>
          <Switch
            checked={pca.status === "publicado"}
            disabled={ro || salvando != null}
            onChange={(v) =>
              salvar({ status: v ? "publicado" : "preview" }, "status", v ? "PCA publicado na tela inicial." : "PCA voltou para Preview.")
            }
            label={pca.status === "publicado" ? "Publicado" : "Preview"}
          />
        </section>

        {pca.fonte === "protocolo" && (
          <section className={CARTAO}>
            <h2 className="mb-3 font-bold text-text">Regras da Mesa do PCA</h2>
            <ul className="space-y-2 text-sm text-text-2">
              <li className="flex gap-2">
                <IconCheck className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--ok)" }} />
                Protocolo marcado com o ano do PCA = {pca.ano ?? "—"}
              </li>
              <li className="flex gap-2">
                <IconCheck className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--ok)" }} />
                Um DFD pertence a um só PCA
              </li>
              <li className="flex gap-2">
                <IconCheck className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--ok)" }} />
                Incorporar é permanente: cada item ganha um nº sequencial único no PCA (retirar o item só inativa o nº)
              </li>
            </ul>
          </section>
        )}

        <section className={CARTAO}>
          <h2 className="mb-1 font-bold text-text">Visão do orçamento</h2>
          <p className="mb-3 text-sm text-muted">Os lançamentos do CUBO de {pca.ano ?? "—"} que contam como orçamento para o PCA (aba Orçamento).</p>
          <select
            className={selectCls}
            value={pca.orcamentoVisaoId ?? ""}
            disabled={ro || salvando != null}
            onChange={(e) => salvar({ orcamentoVisaoId: e.target.value ? Number(e.target.value) : null }, "visao", "Visão do orçamento salva.")}
            aria-label="Visão do orçamento"
          >
            <option value="">Orçamento inteiro (sem visão)</option>
            {visoes.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nome} — {v.resumo}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-faint">
            As visões são criadas em{" "}
            <Link href="/painel/orcamento" className="text-accent hover:underline">
              Orçamento → Visões
            </Link>
            .
          </p>
        </section>

        {podeEditar && (
          <section className={`${CARTAO} flex flex-wrap items-center justify-between gap-3`}>
            <div>
              <h2 className="font-bold text-text">Excluir PCA</h2>
              <p className="text-sm text-muted">Remove o plano e a sua capa. Não pode ser desfeito.</p>
            </div>
            <Button variant="danger" icon={<IconTrash className="h-4 w-4" />} loading={salvando === "excluir"} onClick={excluirPca}>
              Excluir
            </Button>
          </section>
        )}
      </div>

      <section className={`${CARTAO} h-fit`}>
        <h2 className="font-bold text-text">Capa do card</h2>
        <p className="mb-4 text-sm text-muted">Recorte 4:5 · WebP 800×1000</p>
        <div className="mx-auto max-w-[280px]">
          <PcaCapa capa={pca.capa} ano={pca.ano}>
            <div className="absolute inset-x-4 bottom-4 truncate text-base font-bold text-white">{pca.nome}</div>
          </PcaCapa>
        </div>
        {!pca.capa && <p className="mt-3 text-center text-xs text-muted">Sem imagem — usa a capa padrão com o ano</p>}
        {podeEditar && (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                setArquivo(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
            <Button variant="secondary" icon={<IconImage className="h-4 w-4" />} onClick={() => inputRef.current?.click()}>
              Escolher imagem
            </Button>
            {pca.capa && (
              <Button
                variant="ghost"
                icon={<IconTrash className="h-4 w-4" />}
                loading={salvando === "capa-rem"}
                onClick={() => salvar({ capa: null }, "capa-rem", "Capa removida.")}
              >
                Remover
              </Button>
            )}
          </div>
        )}
      </section>

      <RecorteImagem
        arquivo={arquivo}
        salvando={salvando === "capa"}
        onCancelar={() => setArquivo(null)}
        onConfirmar={async (url) => {
          if (await salvar({ capa: url }, "capa", "Capa atualizada.")) setArquivo(null);
        }}
      />

      {aviso && (
        <AvisoFlutuante kind={aviso.kind} titulo={aviso.kind === "ok" ? "Salvo" : "Não foi possível salvar"} onClose={() => setAviso(null)} duracao={aviso.kind === "ok" ? 4000 : undefined}>
          {aviso.texto}
        </AvisoFlutuante>
      )}
    </div>
  );
}
