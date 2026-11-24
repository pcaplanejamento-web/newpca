"use client";

import { memo } from "react";
import type { OpDoc, TamanhoPagina } from "@/lib/documento-pdf-core";

/**
 * PRÉVIA FIEL de um DOCUMENTO em PDF: desenha as MESMAS operações (texto, retângulos, linhas, timbre) que o gerador
 * (`documento-pdf-gerar`) grava no arquivo — as mesmas páginas, posições, quebras, orientação, carimbo e rodapé. Cada página
 * é um SVG na proporção real (pontos do PDF), na largura do painel. `cor` resolve as cores e os papéis da paleta ("@muted").
 */
export function PreviaPaginas({ paginas, tamanhos, cor, timbre }: { paginas: OpDoc[][]; tamanhos: TamanhoPagina[]; cor: (css: string) => string; timbre?: string | null }) {
  return (
    <ol aria-label="Páginas do documento" className="space-y-4">
      {paginas.map((ops, i) => (
        <li key={i} className="[content-visibility:auto] [contain-intrinsic-size:auto_600px]">
          <Pagina ops={ops} tamanho={tamanhos[i]} cor={cor} timbre={timbre} />
          <p className="mt-1 text-center text-[11px] text-faint">
            Página {i + 1} de {paginas.length}
            {tamanhos[i].largura > tamanhos[i].altura ? " · deitada" : ""}
          </p>
        </li>
      ))}
    </ol>
  );
}

const Pagina = memo(function Pagina({ ops, tamanho, cor, timbre }: { ops: OpDoc[]; tamanho: TamanhoPagina; cor: (css: string) => string; timbre?: string | null }) {
  const { largura: W, altura: H } = tamanho;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Página de ${Math.round(W)} por ${Math.round(H)} pontos`}
      className="block h-auto w-full rounded-control bg-white shadow-ring"
      fontFamily="Helvetica, Arial, sans-serif"
    >
      <rect x={0} y={0} width={W} height={H} fill="#ffffff" />
      {ops.map((op, k) => {
        switch (op.t) {
          case "texto":
            return (
              <text key={k} x={op.x} y={op.y} fontSize={op.tam} fontWeight={op.negrito ? 700 : 400} fill={cor(op.cor)} xmlSpace="preserve">
                {op.texto}
              </text>
            );
          case "retangulo":
            return <rect key={k} x={op.x} y={op.y} width={op.w} height={op.h} fill={cor(op.cor)} />;
          case "linha":
            return <line key={k} x1={op.x1} y1={op.y1} x2={op.x2} y2={op.y2} stroke={cor(op.cor)} strokeWidth={op.espessura} />;
          case "timbre":
            return timbre ? <image key={k} href={timbre} x={op.x} y={op.y} width={op.w} height={op.h} preserveAspectRatio="none" /> : null;
          default:
            return null;
        }
      })}
    </svg>
  );
});
