"use client";

import { type ReactNode, useMemo, useState } from "react";
import { brl, num, numeroSemAno } from "@/lib/format";
import type { DfdDoPca, DfdForaDaSoma, ProtocoloDoPca } from "@/lib/pca-espaco";
import type { ItemRow } from "@/lib/queries";
import type { AberturaMesa } from "./BannersMesa";
import { CelulaCopiavel } from "./BotaoCopiar";
import { CelulaTexto } from "./CelulaLista";
import { type Column, DataTable } from "./DataTable";
import { BuscaItens, ItemTable } from "./ItemTable";
import { type LinhaDfd, PlanilhaDfds } from "./PlanilhaDfds";
import { Segmented } from "./Segmented";

type Visao = "protocolos" | "dfds" | "itens" | "fora";

const COLS_PROTOCOLO: Column<ProtocoloDoPca>[] = [
  {
    key: "numero",
    header: "Nº processo",
    nowrap: true,
    value: (p) => p.numero,
    // Copia o nº SEM o ano ("144756/2026" → "144756").
    render: (p) => (
      <CelulaCopiavel copiar={numeroSemAno(p.numero)} rotulo="nº do protocolo">
        <span className="font-mono text-[12px] font-semibold">{p.numero}</span>
      </CelulaCopiavel>
    ),
  },
  { key: "assunto", header: "Assunto", align: "left", minWidth: 220, value: (p) => p.assunto ?? "—", render: (p) => <CelulaTexto texto={p.assunto} /> },
  { key: "sigla", header: "Unidade", nowrap: true, value: (p) => p.sigla ?? "—", render: (p) => <span className="font-mono text-[12px] font-semibold text-text-2">{p.sigla ?? "—"}</span> },
  { key: "dfds", header: "DFDs", nowrap: true, filter: "range", formatarFaixa: num, numero: (p) => p.dfds, render: (p) => num(p.dfds) },
  { key: "itens", header: "Itens", nowrap: true, filter: "range", formatarFaixa: num, numero: (p) => p.itens, render: (p) => num(p.itens) },
  { key: "valor", header: "Valor", align: "right", nowrap: true, filter: "range", numero: (p) => p.valor, render: (p) => <span className="font-semibold tabular-nums">{brl(p.valor)}</span> },
];

/** Os DFDs FORA da soma (a consolidação por nº de planejamento) — só leitura: não estão no PCA, não abrem banner. */
const COLS_FORA: Column<DfdForaDaSoma>[] = [
  {
    key: "protocolo",
    header: "Protocolo",
    nowrap: true,
    value: (d) => d.protocoloNumero ?? "—",
    render: (d) =>
      d.protocoloNumero ? (
        <CelulaCopiavel copiar={numeroSemAno(d.protocoloNumero)} rotulo="nº do protocolo">
          <span className="font-mono text-[12px] font-semibold">{d.protocoloNumero}</span>
        </CelulaCopiavel>
      ) : (
        "—"
      ),
  },
  {
    key: "numero",
    header: "Nº DFD",
    nowrap: true,
    value: (d) => d.numero,
    render: (d) => (
      <CelulaCopiavel copiar={d.numero} rotulo="nº do DFD">
        <span className="font-mono text-[12px] font-semibold">{d.numero}</span>
      </CelulaCopiavel>
    ),
  },
  { key: "plan", header: "Nº Plan.", nowrap: true, value: (d) => d.planejamento ?? "—", render: (d) => <span className="font-mono text-[12px]">{d.planejamento ?? "—"}</span> },
  { key: "itens", header: "Itens", nowrap: true, filter: "range", formatarFaixa: num, numero: (d) => d.itens, render: (d) => num(d.itens) },
  { key: "valor", header: "Valor", align: "right", nowrap: true, filter: "range", numero: (d) => d.valor, render: (d) => <span className="tabular-nums">{brl(d.valor)}</span> },
  { key: "motivo", header: "Motivo", align: "left", minWidth: 260, value: (d) => d.motivo, render: (d) => <CelulaTexto texto={d.motivo} /> },
  { key: "previa", header: "Situação", nowrap: true, value: (d) => (d.previa ? "Prévia" : "Incorporado"), render: (d) => (d.previa ? "Prévia" : "Incorporado") },
];

/**
 * CONSULTA do Dashboard do PCA (fonte protocolo — tela inicial e painel): `Segmented` **Protocolos | DFDs | Itens**
 * no MESMO espaço (morph), com as tabelas do sistema SEM apontar erros (`DataTable` · `PlanilhaDfds` `semEstado` ·
 * `ItemTable` com a origem) + **Fora da soma** (os DFDs que a consolidação tirou, com o motivo — só no painel). A linha abre a pilha de banners DISCRETA da consulta (`BannersConsulta`, renderizada UMA vez
 * pelo `DashboardPcaCliente` — também a usa a origem dos gráficos): `aberto`/`onAbrir` controlados.
 */
export function ConsultaPca({
  protocolos,
  dfds,
  foraDaSoma = [],
  itens,
  showUnidade,
  aberto,
  onAbrir: setAberto,
  fim,
}: {
  protocolos: ProtocoloDoPca[];
  dfds: DfdDoPca[];
  foraDaSoma?: DfdForaDaSoma[];
  itens: ItemRow[];
  showUnidade: boolean;
  aberto: AberturaMesa | null;
  onAbrir: (a: AberturaMesa) => void;
  /** No fim da linha das abas (ex.: o (?)). */
  fim?: ReactNode;
}) {
  const [visao, setVisao] = useState<Visao>("itens");
  const [busca, setBusca] = useState("");

  const linhas = useMemo<LinhaDfd[]>(
    () =>
      dfds.map((d) => ({
        key: d.id,
        numero: d.numero,
        planejamento: d.planejamento,
        sigla: d.sigla ?? "—",
        tipo: d.tipo,
        protocolo: d.protocoloNumero,
        itens: d.itens,
        valor: d.valor,
        estado: "regular", // não exibido (`semEstado`)
      })),
    [dfds],
  );

  return (
    <div className="space-y-[var(--gap-block)]">
      {/* UMA linha: as abas + a busca dos itens + o fim (na altura padrão dos controles). */}
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<Visao>
          value={visao}
          onChange={setVisao}
          ariaLabel="Visão da consulta"
          options={[
            { value: "protocolos", label: `Protocolos (${protocolos.length})` },
            { value: "dfds", label: `DFDs (${dfds.length})` },
            { value: "itens", label: `Itens (${itens.length})` },
            ...(foraDaSoma.length ? [{ value: "fora" as const, label: `Fora da soma (${foraDaSoma.length})` }] : []),
          ]}
        />
        {visao === "itens" && <BuscaItens valor={busca} onMudar={setBusca} />}
        {fim && <div className="ml-auto flex shrink-0 items-center gap-2">{fim}</div>}
      </div>
      <div key={visao} className="animate-cat-morph">
        {visao === "itens" ? (
          <ItemTable
            rows={itens}
            showUnidade={showUnidade}
            origem
            busca={busca}
            onRowClick={(r) => r.dfdId != null && setAberto({ tipo: "item", dfdId: r.dfdId, itemId: r.id, item: { item: r.itemNumero ?? null, codigo: r.idProduto } })}
            ativo={aberto?.tipo === "item" ? aberto.itemId : null}
          />
        ) : visao === "fora" ? (
          <DataTable
            columns={COLS_FORA}
            rows={foraDaSoma}
            getKey={(d) => d.id}
            pageSize={20}
            minWidth={820}
            density="compact"
            exportar={{ nome: "DFDs fora da soma" }}
            resumo={(l) => `${l.length} DFD${l.length === 1 ? "" : "s"} fora da soma · ${num(l.reduce((s, d) => s + d.itens, 0))} itens · ${brl(l.reduce((s, d) => s + d.valor, 0))}`}
          />
        ) : visao === "dfds" ? (
          <PlanilhaDfds linhas={linhas} semEstado onRowClick={(id) => setAberto({ tipo: "dfd", id })} ativa={aberto?.tipo === "dfd" ? aberto.id : null} />
        ) : (
          <DataTable
            columns={COLS_PROTOCOLO}
            rows={protocolos}
            getKey={(p) => p.id}
            pageSize={20}
            minWidth={760}
            onRowClick={(p) => setAberto({ tipo: "protocolo", id: p.id })}
            activeKey={aberto?.tipo === "protocolo" ? aberto.id : null}
            resumo={(l) =>
              `${l.length} protocolo${l.length === 1 ? "" : "s"} · ${num(l.reduce((s, p) => s + p.dfds, 0))} DFDs · ${brl(l.reduce((s, p) => s + p.valor, 0))}`
            }
          />
        )}
      </div>
    </div>
  );
}
