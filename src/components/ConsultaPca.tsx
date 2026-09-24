"use client";

import { useRouter } from "next/navigation";
import { type ComponentProps, useMemo, useState } from "react";
import type { DfdDoPca } from "@/lib/pca-espaco";
import type { ItemRow } from "@/lib/queries";
import { type AberturaMesa, BannersMesa } from "./BannersMesa";
import { ItemTable } from "./ItemTable";
import { type LinhaDfd, PlanilhaDfds } from "./PlanilhaDfds";
import { Segmented } from "./Segmented";

type Visao = "itens" | "dfds";
type ContextoBanners = Omit<ComponentProps<typeof BannersMesa>, "abrir" | "onFechar" | "onAbrir" | "onAlterado" | "reparticaoAtivaId">;

/**
 * CONSULTA do Dashboard do PCA (painel, fonte protocolo): `Segmented` **Itens | DFDs** no MESMO espaço (morph) com as
 * tabelas do sistema SEM apontar erros (`ItemTable` com a origem · `PlanilhaDfds` `semEstado`) e a MESMA pilha de
 * banners da Mesa (`BannersMesa`): a linha de item abre o banner do ITEM ("Ver DFD" traz o DFD ao lado; "Ver
 * protocolo" também) e a de DFD abre o banner do DFD. Gravar num banner recarrega o Dashboard.
 */
export function ConsultaPca({
  itens,
  dfds,
  showUnidade,
  banners,
}: {
  itens: ItemRow[];
  dfds: DfdDoPca[];
  showUnidade: boolean;
  banners: ContextoBanners;
}) {
  const router = useRouter();
  const [visao, setVisao] = useState<Visao>("itens");
  const [aberto, setAberto] = useState<AberturaMesa | null>(null);

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
    <div className="space-y-4">
      <Segmented<Visao>
        value={visao}
        onChange={setVisao}
        ariaLabel="Visão da consulta"
        options={[
          { value: "itens", label: `Itens (${itens.length})` },
          { value: "dfds", label: `DFDs (${dfds.length})` },
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
        ) : (
          <PlanilhaDfds linhas={linhas} semEstado onRowClick={(id) => setAberto({ tipo: "dfd", id })} ativa={aberto?.tipo === "dfd" ? aberto.id : null} />
        )}
      </div>
      <BannersMesa
        {...banners}
        abrir={aberto}
        onFechar={() => setAberto(null)}
        onAbrir={setAberto}
        onAlterado={() => router.refresh()}
        reparticaoAtivaId={null}
      />
    </div>
  );
}
