"use client";

import type { ReactNode } from "react";
import { IconFluxo } from "../icons";
import { CapaQuadro, CartaoEspaco, type MetricaCartao } from "../QuadroCard";

/** A largura MÍNIMA do cartão — a MESMA dos quadros de Tarefas (a grade `auto-fill minmax(15rem)`). */
export const LARGURA_CARTAO = "15rem";

/** A grade simples dos cartões (o esqueleto e o painel "Novo fluxo"); a lista mede as colunas em JS (`useColunas`). */
export const GRADE_CARTOES = "grid gap-[var(--gap-block)] [grid-template-columns:repeat(auto-fill,minmax(min(100%,15rem),1fr))]";

/** O degradê da capa (sem foto): o accent → o accent mais escuro. */
const DEGRADE = JSON.stringify({ cores: ["#3b82f6", "#1e40af"], angulo: 135 });

/**
 * O CARTÃO de uma automação — o MESMO desenho dos quadros de Tarefas e dos catálogos (`CartaoEspaco`): a CAPA 16:9 (sem
 * foto: o degradê + o ícone do fluxo), o sobretítulo, o selo, o nome em até 2 linhas e 3 números. Tamanho SÓLIDO: a altura
 * vem da capa e das linhas fixas, então todos os cartões têm o mesmo formato. É o mesmo na lista e no painel "Novo fluxo".
 */
export function CartaoFluxo({
  titulo,
  sobretitulo,
  selo,
  metricas,
  marcado,
  onClick,
}: {
  titulo: string;
  sobretitulo: string;
  selo?: ReactNode;
  metricas: MetricaCartao[];
  marcado?: boolean;
  onClick: () => void;
}) {
  return (
    <CartaoEspaco
      onClick={onClick}
      ariaLabel={`Abrir ${titulo}`}
      atual={marcado}
      capa={
        <CapaQuadro quadro={{ cor: "var(--accent)", fundoUrl: null, fundoAjuste: null, fundoGradiente: DEGRADE }}>
          <span aria-hidden className="absolute inset-0 grid place-items-center text-white/85">
            <IconFluxo className="h-10 w-10" />
          </span>
        </CapaQuadro>
      }
      sobretitulo={sobretitulo}
      selo={selo}
      nome={titulo}
      metricas={metricas}
    />
  );
}
