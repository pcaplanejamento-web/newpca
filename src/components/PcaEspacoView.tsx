"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { type CamadaPca, type FontePca, ROTULO_FONTE, ROTULO_STATUS, type StatusPca } from "@/lib/pca-core";
import { Badge } from "./Badge";
import { IconChevronLeft } from "./icons";
import { PcaCapa } from "./PcaCard";
import { Segmented } from "./Segmented";
import { Skeleton, SkeletonLinhas } from "./Skeleton";

export type AbaPca = "dashboard" | "orcamento" | "mesa" | "configuracao";

/**
 * ESPAÇO do PCA (`/painel/pca/[id]`): cabeçalho (capa, nome, status, fonte · ano), o seletor da
 * CAMADA vista (Preview = tudo · Publicado = o que o público vê — só na fonte protocolo) e as abas
 * Dashboard · Orçamento · Mesa|Importação · Configuração no MESMO espaço, com o morph da Mesa. O
 * conteúdo de cada aba chega pronto do servidor.
 */
export function PcaEspacoView({
  pca,
  camada,
  aba: abaServidor,
  children,
}: {
  pca: { nome: string; ano: number | null; fonte: FontePca; status: StatusPca; capa: string | null };
  camada: CamadaPca;
  /** A aba que o servidor montou (`children`). */
  aba: AbaPca;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  // A aba pedida (clique) até o servidor devolvê-la; depois vale a do servidor (inclusive voltar/avançar).
  const [pedida, setPedida] = useState<AbaPca | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: zera a pendência quando a aba do SERVIDOR muda.
  useEffect(() => setPedida(null), [abaServidor]);
  const aba = pedida ?? abaServidor;

  const trocarAba = (a: AbaPca) => {
    if (a === aba) return;
    setPedida(a);
    const p = new URLSearchParams(sp.toString());
    p.set("aba", a);
    router.push(`${pathname}?${p.toString()}`, { scroll: false });
  };
  const trocarCamada = (c: CamadaPca) => {
    const p = new URLSearchParams(sp.toString());
    p.set("aba", aba);
    if (c === "publicado") p.set("camada", "publicado");
    else p.delete("camada");
    router.push(`${pathname}?${p.toString()}`);
  };

  return (
    <div className="space-y-5">
      <Link href="/painel/pca" className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-text-2">
        <IconChevronLeft className="h-4 w-4" /> PCA
      </Link>

      <div className="flex flex-wrap items-center gap-4">
        <div className="w-16 shrink-0 sm:w-20">
          <PcaCapa capa={pca.capa} ano={null} className="!rounded-xl" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 max-w-full truncate text-2xl font-black tracking-tight text-text sm:text-3xl">{pca.nome}</h1>
            <Badge tone={pca.status === "publicado" ? "emerald" : "amber"} dot>
              {ROTULO_STATUS[pca.status]}
            </Badge>
          </div>
          <p className="text-sm text-muted">
            {ROTULO_FONTE[pca.fonte]} · ano {pca.ano ?? "—"}
          </p>
        </div>
        {pca.fonte === "protocolo" && (aba === "dashboard" || aba === "orcamento") && (
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <span className="text-xs text-muted">Visão</span>
            <Segmented<CamadaPca>
              value={camada}
              onChange={trocarCamada}
              options={[
                { value: "preview", label: "Preview" },
                { value: "publicado", label: "Publicado" },
              ]}
            />
          </div>
        )}
      </div>

      <Segmented<AbaPca>
        value={aba}
        onChange={trocarAba}
        options={[
          { value: "dashboard", label: "Dashboard" },
          { value: "orcamento", label: "Orçamento" },
          { value: "mesa", label: pca.fonte === "lista" ? "Importação" : "Mesa" },
          { value: "configuracao", label: "Configuração" },
        ]}
      />

      {aba === abaServidor ? (
        <div key={aba} className="animate-cat-morph">
          {children}
        </div>
      ) : (
        <div className="space-y-4" aria-busy="true">
          <Skeleton className="h-24 w-full" />
          <SkeletonLinhas linhas={8} />
        </div>
      )}
    </div>
  );
}
