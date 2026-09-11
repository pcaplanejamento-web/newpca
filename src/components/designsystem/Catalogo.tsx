"use client";

import { type ReactNode, useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { ColorField } from "@/components/ColorField";
import { type Column, DataTable } from "@/components/DataTable";
import { FilterChip } from "@/components/FilterChip";
import * as Icons from "@/components/icons";
import { IconBox, IconFile, IconLayers, IconPlus, IconUpload } from "@/components/icons";
import { KpiStat } from "@/components/KpiStat";
import { MultiSelectHeader } from "@/components/MultiSelectHeader";
import { PeriodoPicker } from "@/components/PeriodoPicker";
import { Segmented } from "@/components/Segmented";
import { NaturezaTag, SituacaoDot } from "@/components/StatusTag";
import { Tabs } from "@/components/Tabs";
import { toast } from "@/components/Toast";
import { TokenEditor } from "./TokenEditor";

// Biblioteca de componentes (fonte única, spec §39.25) — rota pública
// `/design-system`. Mostra TODO componente do sistema (botões, ícones, status,
// KPIs, tabelas, filtros, cor, abas, toasts…), por token, claro/escuro, touch e
// responsivo. `?view=frame` renderiza só a vitrine (usado no preview mobile).

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.06em] text-faint">
        {titulo}
      </h2>
      <div className="rounded-card border border-border bg-surface p-4 shadow-ring sm:p-5">{children}</div>
    </section>
  );
}

function Swatch({ nome, token }: { nome: string; token: string }) {
  return (
    <div className="min-w-0">
      <div className="h-12 rounded-control border border-border-2" style={{ background: `var(${token})` }} />
      <div className="mt-1 truncate text-[11px] text-muted" title={token}>
        {nome}
      </div>
    </div>
  );
}

const NEUTROS: [string, string][] = [
  ["bg", "--bg"], ["surface", "--surface"], ["surface-2", "--surface-2"], ["text", "--text"],
  ["text-2", "--text-2"], ["muted", "--muted"], ["faint", "--faint"], ["border", "--border"],
  ["border-2", "--border-2"], ["accent", "--accent"], ["accent-soft", "--accent-soft"],
];
const SEMANTICAS: [string, string][] = [
  ["exclusão", "--nat-exclusao"], ["inclusão 26", "--nat-inclusao-2026"], ["inclusão 27", "--nat-inclusao-2027"],
  ["correção", "--nat-correcao"], ["comunicação", "--nat-comunicacao"], ["em análise", "--sit-em-analise"],
  ["finalizado", "--sit-finalizado"], ["devolvido", "--sit-devolvido"], ["cancelado", "--sit-cancelado"],
];
const NATUREZAS = ["EXCLUSÃO", "INCLUSÃO 2026", "INCLUSÃO 2027", "CORREÇÃO", "COMUNICAÇÃO INTERNA"];
const SITUACOES = [
  { v: "em_analise", l: "Em análise" }, { v: "em_andamento", l: "Em andamento" },
  { v: "finalizado", l: "Finalizado" }, { v: "devolvido", l: "Devolvido" }, { v: "cancelado", l: "Cancelado" },
];
const ORGAOS = [
  "Secretaria Municipal de Saúde", "Secretaria Municipal de Educação", "Secretaria de Infraestrutura",
  "Procuradoria-Geral do Município", "Gabinete do Prefeito", "Secretaria de Meio Ambiente",
  "Secretaria de Assistência Social",
];
const ICONES = (
  Object.entries(Icons) as [string, (p: { className?: string }) => ReactNode][]
).filter(([k]) => k.startsWith("Icon"));

type Proto = {
  id: number;
  data: string;
  orgao: string;
  sigla: string;
  natureza: string;
  responsavel: string;
  situacao: string;
};
const SIT_LABEL: Record<string, string> = {
  em_analise: "Em análise",
  em_andamento: "Em andamento",
  finalizado: "Finalizado",
  devolvido: "Devolvido",
  cancelado: "Cancelado",
};
const PROTOS: Proto[] = [
  { id: 118223, data: "02/09/2026", orgao: "Secretaria Municipal de Saúde", sigla: "SMS", natureza: "INCLUSÃO 2027", responsavel: "Naty", situacao: "em_analise" },
  { id: 115282, data: "28/08/2026", orgao: "Secretaria Municipal de Educação", sigla: "SME", natureza: "EXCLUSÃO", responsavel: "Cris", situacao: "finalizado" },
  { id: 117904, data: "30/08/2026", orgao: "Secretaria de Infraestrutura", sigla: "SEINFRA", natureza: "CORREÇÃO", responsavel: "Thamires", situacao: "em_analise" },
  { id: 116540, data: "25/08/2026", orgao: "Diretoria de Logística e Transporte", sigla: "DLT", natureza: "INCLUSÃO 2026", responsavel: "Naty", situacao: "devolvido" },
  { id: 118990, data: "04/09/2026", orgao: "Secretaria Municipal da Fazenda", sigla: "SEFAZ", natureza: "COMUNICAÇÃO INTERNA", responsavel: "", situacao: "em_analise" },
  { id: 113220, data: "12/08/2026", orgao: "Gabinete do Prefeito", sigla: "GAB", natureza: "EXCLUSÃO", responsavel: "Naty", situacao: "cancelado" },
];
const COLUNAS: Column<Proto>[] = [
  {
    key: "data",
    header: "Data",
    minWidth: 110,
    filter: "date",
    value: (r) => r.data.split("/").reverse().join("-"),
    render: (r) => <span className="font-mono text-[12px] text-muted">{r.data}</span>,
  },
  {
    key: "id",
    header: "Protocolo",
    minWidth: 100,
    value: (r) => String(r.id),
    render: (r) => <span className="font-mono font-semibold text-text">{r.id}</span>,
  },
  {
    key: "orgao",
    header: "Órgão",
    minWidth: 220,
    filterOptions: ORGAOS,
    value: (r) => r.orgao,
    render: (r) => (
      <div className="min-w-0">
        <div className="truncate font-medium text-text">{r.orgao}</div>
        <div className="text-[11px] text-faint">{r.sigla}</div>
      </div>
    ),
  },
  {
    key: "natureza",
    header: "Natureza",
    minWidth: 172,
    value: (r) => r.natureza,
    render: (r) => <NaturezaTag natureza={r.natureza} />,
  },
  {
    key: "responsavel",
    header: "Responsável",
    minWidth: 150,
    value: (r) => r.responsavel || "—",
    render: (r) =>
      r.responsavel ? (
        <div className="flex items-center gap-2">
          <Avatar nome={r.responsavel} size="sm" />
          <span className="text-text-2">{r.responsavel}</span>
        </div>
      ) : (
        <span className="text-faint">—</span>
      ),
  },
  {
    key: "situacao",
    header: "Situação",
    minWidth: 130,
    value: (r) => SIT_LABEL[r.situacao] ?? "—",
    render: (r) => <SituacaoDot situacao={r.situacao} label={SIT_LABEL[r.situacao] ?? "—"} />,
  },
];

export function Catalogo() {
  const [aba, setAba] = useState("todos");
  const [cor, setCor] = useState("#4f46e5");
  const [orgaos, setOrgaos] = useState<string[]>([]);
  const [sortOrgao, setSortOrgao] = useState<"asc" | "desc" | null>(null);
  const [framed, setFramed] = useState(false);
  const [device, setDevice] = useState("desktop");
  const [tsel, setTsel] = useState<Set<string | number>>(new Set());

  useEffect(() => {
    setFramed(new URLSearchParams(window.location.search).get("view") === "frame");
  }, []);

  const vitrine = (
    <>
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

      <Secao titulo="Ícones (biblioteca)">
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8 lg:grid-cols-13">
          {ICONES.map(([nome, Icon]) => (
            <div
              key={nome}
              title={nome}
              className="flex flex-col items-center gap-1 rounded-control border border-border bg-surface-2 p-2"
            >
              <Icon className="h-5 w-5 text-text-2" />
              <span className="w-full truncate text-center text-[9px] text-faint">{nome.replace("Icon", "")}</span>
            </div>
          ))}
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
          <KpiStat label="Total de protocolos" value="122" delta={{ dir: "up", value: "8" }} spark={[30, 45, 40, 55, 60, 80, 95]} hint="esta semana" />
          <KpiStat label="Em análise" value="41" cor="var(--sit-em-analise)" delta={{ dir: "up", value: "5" }} spark={[20, 30, 25, 35, 45, 60, 70]} hint="aguardando" />
          <KpiStat label="Finalizados" value="63" cor="var(--sit-finalizado)" delta={{ dir: "up", value: "11" }} spark={[35, 40, 50, 55, 65, 75, 90]} hint="no mês" />
          <KpiStat label="Devolvidos" value="12" cor="var(--sit-devolvido)" delta={{ dir: "down", value: "2" }} spark={[60, 50, 45, 40, 30, 25, 20]} hint="vs. mês anterior" />
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

      <Secao titulo="Abas (swipe no mobile, sublinhado animado)">
        <Tabs
          tabs={[
            { key: "orc", label: "Orçamentário", icon: <IconBox className="h-4 w-4" />, content: <p className="text-[13px] text-text-2">Conteúdo do orçamentário. No celular, arraste para o lado para trocar de aba.</p> },
            { key: "frotas", label: "Frotas", icon: <IconLayers className="h-4 w-4" />, content: <p className="text-[13px] text-text-2">Conteúdo de frotas.</p> },
            { key: "docs", label: "Documentos", icon: <IconFile className="h-4 w-4" />, content: <p className="text-[13px] text-text-2">Conteúdo de documentos.</p> },
          ]}
        />
      </Secao>

      <Secao titulo="Abas de filtro (segmented) & chips">
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
        </div>
      </Secao>

      <Secao titulo="Filtro de cabeçalho & Período">
        <div className="flex flex-wrap items-center gap-6">
          <div className="rounded-control border border-border bg-surface-2 px-2">
            <MultiSelectHeader label="Órgão" options={ORGAOS} value={orgaos} onApply={setOrgaos} onSort={setSortOrgao} sortDir={sortOrgao} />
          </div>
          <PeriodoPicker anos={[2027, 2026, 2025]} value={{ preset: "todo" }} />
        </div>
        <p className="mt-2 text-[12px] text-faint">
          {orgaos.length > 0 && orgaos.length < ORGAOS.length ? `${orgaos.length} órgão(s) filtrado(s)` : "Sem filtro"}
          {sortOrgao ? ` · ordem ${sortOrgao === "asc" ? "crescente" : "decrescente"}` : ""}
        </p>
      </Secao>

      <Secao titulo="Seletor de cor (conta-gotas + salvos)">
        <div className="flex flex-wrap items-center gap-4">
          <ColorField value={cor} onChange={setCor} label="Cor primária" />
          <div className="flex items-center gap-2 text-[13px] text-text-2">
            <span className="h-6 w-6 rounded-md border border-border-2" style={{ background: cor }} />
            <span className="font-mono">{cor}</span>
          </div>
        </div>
      </Secao>

      <Secao titulo="Banners flutuantes (Toast)">
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => toast.success("Configuração salva com sucesso.")}>Sucesso</Button>
          <Button variant="secondary" onClick={() => toast.info("Isto é um aviso informativo.")}>Info</Button>
          <Button variant="secondary" onClick={() => toast.warning("Atenção: revise os dados.")}>Alerta</Button>
          <Button variant="secondary" onClick={() => toast.error("Falha ao salvar. Tente novamente.")}>Erro</Button>
        </div>
      </Secao>

      <Secao titulo="Sombra suave (contorno suave)">
        <div className="flex flex-wrap gap-4">
          <div className="rounded-card bg-surface p-5 shadow-soft">
            <p className="text-[13px] font-semibold text-text">Card com --shadow-soft</p>
            <p className="mt-1 text-[12px] text-muted">Elevação suave para popovers e cards flutuantes.</p>
          </div>
          <div className="rounded-card border border-border bg-surface p-5 shadow-ring">
            <p className="text-[13px] font-semibold text-text">Card com --ring</p>
            <p className="mt-1 text-[12px] text-muted">Elevação padrão dos cards (spec §2).</p>
          </div>
        </div>
      </Secao>

      <Secao titulo="Tabela (seleção de linhas + filtro no cabeçalho)">
        <DataTable
          columns={COLUNAS}
          rows={PROTOS}
          getKey={(r) => r.id}
          selectable
          selected={tsel}
          onSelected={setTsel}
          pageSize={4}
          footer={tsel.size > 0 ? `${tsel.size} selecionada(s)` : undefined}
        />
      </Secao>
    </>
  );

  // Modo "frame": só a vitrine (usado dentro do iframe de preview mobile).
  if (framed) {
    return (
      <div className="min-h-dvh bg-bg text-text">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{vitrine}</div>
      </div>
    );
  }

  const larguraDevice = device === "mobile" ? 390 : 768;

  return (
    <div className="min-h-dvh bg-bg text-text">
      <div className="mx-auto max-w-6xl px-4 py-[var(--pad-canvas)] sm:px-6">
        <header className="mb-6">
          <h1 className="text-[27px] font-bold tracking-[-0.02em] text-text">Design System</h1>
          <p className="mt-1 text-[13.5px] text-muted">
            Plataforma PCA · biblioteca única de componentes (tokens, claro/escuro, toque, responsivo)
          </p>
        </header>

        <TokenEditor />

        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-[12px] text-faint">Pré-visualização</span>
          <Segmented
            value={device}
            onChange={setDevice}
            options={[
              { value: "desktop", label: "Desktop" },
              { value: "tablet", label: "Tablet" },
              { value: "mobile", label: "Mobile" },
            ]}
          />
        </div>

        {device === "desktop" ? (
          vitrine
        ) : (
          <div className="mt-4 flex justify-center">
            <div className="max-w-full rounded-[28px] border-4 border-border-2 bg-bg p-2 shadow-soft">
              <iframe
                title="Pré-visualização responsiva"
                src="/design-system?view=frame"
                className="block rounded-[18px] border border-border bg-bg"
                style={{ width: larguraDevice, height: 760, maxWidth: "100%" }}
              />
            </div>
          </div>
        )}

        <footer className="mt-10 border-t border-border pt-4 text-[12px] text-faint">
          Plataforma PCA — Design System · tokens em globals.css · spec Claude Design
        </footer>
      </div>
    </div>
  );
}
