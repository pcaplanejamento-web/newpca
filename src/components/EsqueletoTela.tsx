import type { ReactNode } from "react";
import { EsqueletoControle, Skeleton } from "./Skeleton";

/**
 * ESQUELETO DE UMA TELA — a moldura do `loading.tsx` de cada rota. NÃO desenha nada por conta própria: a tela COMPÕE os
 * esqueletos dos SEUS componentes (cada componente tem o seu, junto dele — `EsqueletoTabela`, `EsqueletoCartaoEspaco`,
 * `EsqueletoPcaCard`, `EsqueletoOrcamentoCard`, `EsqueletoTabsLaterais`, `EsqueletoCalendario`, `EsqueletoSegmented`…), então
 * mudar um componente muda o esqueleto dele em toda tela. Sem dado e sem pedir nada ao servidor. SÓ APARECE QUANDO A TELA
 * DEMORA (`.esqueleto-tela`: invisível nos primeiros 450 ms) — a que chega antes entra direto; as já vistas voltam do cache.
 * `cheia` = do topo do conteúdo até o fim do display no desktop (as telas de tabela/calendário/abas, que não rolam a página).
 */
export function EsqueletoTela({ cheia = false, children }: { cheia?: boolean; children: ReactNode }) {
  return (
    <div
      className={`esqueleto-tela ${cheia ? "flex flex-col gap-[var(--gap-block)] lg:h-[max(240px,calc(100dvh-var(--h-header)-var(--pad-canvas-y)*2))]" : "space-y-[var(--gap-block)]"}`}
      aria-busy="true"
    >
      <span className="sr-only" role="status">
        Carregando a tela…
      </span>
      {children}
    </div>
  );
}

/**
 * Esqueleto da BARRA DE FERRAMENTAS de uma tela (as telas não têm título): `controles` = os principais à esquerda
 * (seletores, busca), `icones` = os botões só-ícone à direita (recarregar, ajuda) — a regra da `.barra-ferramentas`.
 */
export function EsqueletoBarra({ controles = 1, icones = 2 }: { controles?: number; icones?: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {Array.from({ length: controles }, (_, i) => (
        <EsqueletoControle key={`c${i}`} className="w-40" />
      ))}
      {Array.from({ length: icones }, (_, i) => (
        <EsqueletoControle key={`i${i}`} quadrado className={i === 0 ? "ml-auto" : ""} />
      ))}
    </div>
  );
}

/** Esqueleto dos INDICADORES (`IndicadoresKpi`): os quatro cartões principais na MESMA grade. */
export function EsqueletoIndicadores() {
  return (
    <div className="grid grid-cols-1 gap-[var(--gap-block)] sm:grid-cols-2 lg:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-[132px] rounded-card" />
      ))}
    </div>
  );
}

/**
 * Esqueleto da LINHA DAS TELAS INTERNAS (espaço do PCA, orçamento, pasta, órgão): o voltar à esquerda e, com `abas`, as
 * abas logo depois — sem título (o nome está no caminho do cabeçalho).
 */
export function EsqueletoEspaco({ abas = 0 }: { abas?: number }) {
  return (
    <div className="linha-topico flex flex-wrap items-center gap-2">
      <EsqueletoControle quadrado />
      {abas > 0 && (
        <div className="flex gap-1">
          {Array.from({ length: abas }, (_, i) => (
            <EsqueletoControle key={i} className="w-24" />
          ))}
        </div>
      )}
    </div>
  );
}
