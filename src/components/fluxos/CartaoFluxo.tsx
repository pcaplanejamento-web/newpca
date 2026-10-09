"use client";

import type { ReactNode } from "react";
import type { AjudaFluxo } from "@/lib/fluxo-core";
import { IconFluxo } from "../icons";
import { AjudaDoFluxo } from "./ConfigFluxo";
import { CapaQuadro, CartaoEspaco, type MetricaCartao } from "../QuadroCard";

/** A largura MÍNIMA do cartão — a MESMA dos quadros de Tarefas (a grade `auto-fill minmax(15rem)`). */
export const LARGURA_CARTAO = "15rem";

/** A grade simples dos cartões (o esqueleto e o painel "Novo fluxo"); a lista mede as colunas em JS (`useColunas`). */
export const GRADE_CARTOES = "grid gap-[var(--gap-block)] [grid-template-columns:repeat(auto-fill,minmax(min(100%,15rem),1fr))]";


/**
 * O CARTÃO de uma automação — o MESMO desenho dos quadros de Tarefas e dos catálogos (`CartaoEspaco`): a CAPA 16:9 (sem
 * foto: o degradê no accent do tema + o ícone do fluxo), o sobretítulo, o selo, o nome em até 2 linhas e 3 números. Tamanho SÓLIDO: a altura
 * vem da capa e das linhas fixas, então todos os cartões têm o mesmo formato. É o mesmo na lista e no painel "Novo fluxo".
 * `ajuda` = o "(?)" sobre a capa: tocar e saber o que a automação faz, sem abrir (fora do botão e do arrasto do cartão).
 */
export function CartaoFluxo({
  titulo,
  sobretitulo,
  selo,
  metricas,
  marcado,
  ajuda,
  onClick,
}: {
  titulo: string;
  sobretitulo: string;
  selo?: ReactNode;
  metricas: MetricaCartao[];
  marcado?: boolean;
  ajuda?: AjudaFluxo;
  onClick: () => void;
}) {
  return (
    <CartaoEspaco
      onClick={onClick}
      ariaLabel={`Abrir ${titulo}`}
      atual={marcado}
      capa={
        <CapaQuadro quadro={{ cor: "transparent", fundoUrl: null, fundoAjuste: null, fundoGradiente: null }}>
          {/* Sem foto: o degradê no ACCENT do tema (segue a Aparência do ADM, claro e escuro). */}
          <span
            aria-hidden
            className="absolute inset-0 grid place-items-center text-white/85"
            style={{ background: "linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #000))" }}
          >
            <IconFluxo className="h-10 w-10" />
          </span>
        </CapaQuadro>
      }
      sobretitulo={sobretitulo}
      selo={selo}
      nome={titulo}
      metricas={metricas}
      canto={
        ajuda && (
          // O "(?)" não arrasta o cartão nem o abre: só mostra o que a automação faz.
          <div role="none" className="absolute top-3.5 right-3.5 rounded-control bg-surface/90 shadow-ring backdrop-blur-sm" onPointerDown={(e) => e.stopPropagation()}>
            <AjudaDoFluxo titulo={titulo} ajuda={ajuda} />
          </div>
        )
      }
    />
  );
}
