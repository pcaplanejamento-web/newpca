"use client";

import { useMemo, useState } from "react";
import { brl, num } from "@/lib/format";
import type { DfdDoPca, ProtocoloDoPca } from "@/lib/pca-espaco";
import type { ItemRow } from "@/lib/queries";
import type { AberturaMesa } from "./BannersMesa";
import { type Column, DataTable } from "./DataTable";
import { ItemTable } from "./ItemTable";
import { type LinhaDfd, PlanilhaDfds } from "./PlanilhaDfds";
import { Segmented } from "./Segmented";

type Visao = "protocolos" | "dfds" | "itens";

const COLS_PROTOCOLO: Column<ProtocoloDoPca>[] = [
  { key: "numero", header: "Nº processo", nowrap: true, value: (p) => p.numero, render: (p) => <span className="font-mono text-[12px] font-semibold">{p.numero}</span> },
  { key: "assunto", header: "Assunto", align: "left", minWidth: 220, value: (p) => p.assunto ?? "—", render: (p) => <span className="line-clamp-2">{p.assunto ?? "—"}</span> },
  { key: "sigla", header: "Unidade", nowrap: true, value: (p) => p.sigla ?? "—", render: (p) => <span className="font-mono text-[12px] font-semibold text-text-2">{p.sigla ?? "—"}</span> },
  { key: "dfds", header: "DFDs", nowrap: true, filter: "range", formatarFaixa: num, numero: (p) => p.dfds, render: (p) => num(p.dfds) },
  { key: "itens", header: "Itens", nowrap: true, filter: "range", formatarFaixa: num, numero: (p) => p.itens, render: (p) => num(p.itens) },
  { key: "valor", header: "Valor", align: "right", nowrap: true, filter: "range", numero: (p) => p.valor, render: (p) => <span className="font-semibold tabular-nums">{brl(p.valor)}</span> },
];

/**
 * CONSULTA do Dashboard do PCA (fonte protocolo — tela inicial e painel): `Segmented` **Protocolos | DFDs | Itens**
 * no MESMO espaço (morph), com as tabelas do sistema SEM apontar erros (`DataTable` · `PlanilhaDfds` `semEstado` ·
 * `ItemTable` com a origem). A linha abre a pilha de banners DISCRETA da consulta (`BannersConsulta`, renderizada UMA vez
 * pelo `DashboardPcaCliente` — também a usa a origem dos gráficos): `aberto`/`onAbrir` controlados.
 */
export function ConsultaPca({
  protocolos,
  dfds,
  itens,
  showUnidade,
  aberto,
  onAbrir: setAberto,
}: {
  protocolos: ProtocoloDoPca[];
  dfds: DfdDoPca[];
  itens: ItemRow[];
  showUnidade: boolean;
  aberto: AberturaMesa | null;
  onAbrir: (a: AberturaMesa) => void;
}) {
  const [visao, setVisao] = useState<Visao>("itens");

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
      <Segmented<Visao>
        value={visao}
        onChange={setVisao}
        ariaLabel="Visão da consulta"
        options={[
          { value: "protocolos", label: `Protocolos (${protocolos.length})` },
          { value: "dfds", label: `DFDs (${dfds.length})` },
          { value: "itens", label: `Itens (${itens.length})` },
        ]}
      />
      <div key={visao} className="animate-cat-morph">
        {visao === "itens" ? (
          <ItemTable
            rows={itens}
            showUnidade={showUnidade}
            origem
            onRowClick={(r) => r.dfdId != null && setAberto({ tipo: "item", dfdId: r.dfdId, itemId: r.id, item: { item: r.itemNumero ?? null, codigo: r.idProduto } })}
            ativo={aberto?.tipo === "item" ? aberto.itemId : null}
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
