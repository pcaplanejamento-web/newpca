"use client";

import { type ReactNode, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { FilterChip } from "@/components/FilterChip";
import { IconPlus, IconUpload } from "@/components/icons";
import { KpiStat } from "@/components/KpiStat";
import { Segmented } from "@/components/Segmented";
import { NaturezaTag, SituacaoDot } from "@/components/StatusTag";
import { TokenEditor } from "./TokenEditor";

// Biblioteca de componentes (spec §39.25) — rota pública `/design-system`.
// Mostra os componentes reais do app (não recria), por token, em claro/escuro.
// É também a superfície de validação do Theme Playground.

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.06em] text-faint">
        {titulo}
      </h2>
      <div className="rounded-card border border-border bg-surface p-5 shadow-ring">{children}</div>
    </section>
  );
}

function Swatch({ nome, token }: { nome: string; token: string }) {
  return (
    <div className="min-w-0">
      <div
        className="h-12 rounded-control border border-border-2"
        style={{ background: `var(${token})` }}
      />
      <div className="mt-1 truncate text-[11px] text-muted" title={token}>
        {nome}
      </div>
    </div>
  );
}

const NEUTROS = [
  ["bg", "--bg"],
  ["surface", "--surface"],
  ["surface-2", "--surface-2"],
  ["text", "--text"],
  ["text-2", "--text-2"],
  ["muted", "--muted"],
  ["faint", "--faint"],
  ["border", "--border"],
  ["border-2", "--border-2"],
  ["accent", "--accent"],
  ["accent-soft", "--accent-soft"],
] as const;

const SEMANTICAS = [
  ["exclusão", "--nat-exclusao"],
  ["inclusão 26", "--nat-inclusao-2026"],
  ["inclusão 27", "--nat-inclusao-2027"],
  ["correção", "--nat-correcao"],
  ["comunicação", "--nat-comunicacao"],
  ["em análise", "--sit-em-analise"],
  ["finalizado", "--sit-finalizado"],
  ["devolvido", "--sit-devolvido"],
  ["cancelado", "--sit-cancelado"],
] as const;

const NATUREZAS = ["EXCLUSÃO", "INCLUSÃO 2026", "INCLUSÃO 2027", "CORREÇÃO", "COMUNICAÇÃO INTERNA"];
const SITUACOES: { v: string; l: string }[] = [
  { v: "em_analise", l: "Em análise" },
  { v: "em_andamento", l: "Em andamento" },
  { v: "finalizado", l: "Finalizado" },
  { v: "devolvido", l: "Devolvido" },
  { v: "cancelado", l: "Cancelado" },
];

export function Catalogo() {
  const [aba, setAba] = useState("todos");

  return (
    <div className="min-h-dvh bg-bg text-text">
      <div className="mx-auto max-w-6xl px-4 py-[var(--pad-canvas)] sm:px-6">
        <header className="mb-6">
          <h1 className="text-[27px] font-bold tracking-[-0.02em] text-text">Design System</h1>
          <p className="mt-1 text-[13.5px] text-muted">
            Plataforma PCA · componentes orientados a tokens (claro/escuro, responsivo)
          </p>
        </header>

        <TokenEditor />

        <Secao titulo="Cores — neutros">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6 lg:grid-cols-11">
            {NEUTROS.map(([n, t]) => (
              <Swatch key={t} nome={n} token={t} />
            ))}
          </div>
        </Secao>

        <Secao titulo="Cores — semânticas">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-9">
            {SEMANTICAS.map(([n, t]) => (
              <Swatch key={t} nome={n} token={t} />
            ))}
          </div>
        </Secao>

        <Secao titulo="Tipografia (Geist)">
          <div className="space-y-2">
            <p className="text-[27px] font-bold tracking-[-0.02em]">Título da página · 27/700</p>
            <p className="text-[14px] font-semibold">Nome do produto · 14/600</p>
            <p className="text-[13px] text-text-2">Corpo / célula · 13/400 — texto secundário</p>
            <p className="font-mono text-[13.5px]">Mono · 2026/118223 · 11/09/2026 · ⌘K</p>
          </div>
        </Secao>

        <Secao titulo="Botões">
          <div className="flex flex-wrap items-center gap-3">
            <Button icon={<IconPlus className="h-[18px] w-[18px]" />}>Novo Protocolo</Button>
            <Button variant="secondary">Secundário</Button>
            <Button variant="icon" aria-label="Exportar">
              <IconUpload className="h-[18px] w-[18px]" />
            </Button>
            <Button variant="ghost">Ghost</Button>
            <Button loading>Carregando</Button>
            <Button disabled>Desativado</Button>
          </div>
        </Secao>

        <Secao titulo="Status — Natureza (keyline) e Situação (dot)">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {NATUREZAS.map((n) => (
              <NaturezaTag key={n} natureza={n} />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-4">
            {SITUACOES.map((s) => (
              <SituacaoDot key={s.v} situacao={s.v} label={s.l} />
            ))}
          </div>
        </Secao>

        <Secao titulo="KPIs">
          <div className="grid grid-cols-1 gap-[var(--gap-block)] sm:grid-cols-2 lg:grid-cols-4">
            <KpiStat
              label="Total de protocolos"
              value="122"
              delta={{ dir: "up", value: "8" }}
              spark={[30, 45, 40, 55, 60, 80, 95]}
              hint="esta semana"
            />
            <KpiStat
              label="Em análise"
              value="41"
              cor="var(--sit-em-analise)"
              delta={{ dir: "up", value: "5" }}
              spark={[20, 30, 25, 35, 45, 60, 70]}
              hint="aguardando"
            />
            <KpiStat
              label="Finalizados"
              value="63"
              cor="var(--sit-finalizado)"
              delta={{ dir: "up", value: "11" }}
              spark={[35, 40, 50, 55, 65, 75, 90]}
              hint="no mês"
            />
            <KpiStat
              label="Devolvidos"
              value="12"
              cor="var(--sit-devolvido)"
              delta={{ dir: "down", value: "2" }}
              spark={[60, 50, 45, 40, 30, 25, 20]}
              hint="vs. mês anterior"
            />
          </div>
        </Secao>

        <Secao titulo="Avatares">
          <div className="flex flex-wrap items-center gap-3">
            {["Jhone Prado", "Maria Silva", "Naty Costa", "Cris Souza", "Thamires Lima"].map((n) => (
              <div key={n} className="flex items-center gap-2">
                <Avatar nome={n} size="lg" />
                <span className="text-[13px] text-text-2">{n}</span>
              </div>
            ))}
          </div>
        </Secao>

        <Secao titulo="Abas & Filtros">
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              value={aba}
              onChange={setAba}
              options={[
                { value: "todos", label: "Todos" },
                { value: "analise", label: "Em análise" },
                { value: "meus", label: "Meus" },
                { value: "sem", label: "Sem responsável" },
              ]}
            />
            <FilterChip label="Natureza" />
            <FilterChip label="Órgão" active />
            <FilterChip label="Período" />
          </div>
        </Secao>

        <footer className="mt-10 border-t border-border pt-4 text-[12px] text-faint">
          Plataforma PCA — Design System · tokens em globals.css · spec Claude Design
        </footer>
      </div>
    </div>
  );
}
