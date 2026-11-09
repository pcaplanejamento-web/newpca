import type { ReactNode } from "react";
import { EsqueletoSegmented } from "./SegmentedEsqueleto";
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
      className={`esqueleto-tela ${cheia ? "flex flex-col space-y-[var(--gap-block)] lg:h-[max(240px,calc(100dvh-var(--h-header)-var(--pad-canvas-y)*2))]" : "space-y-[var(--gap-block)]"}`}
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

/** A GRADE ÚNICA dos cartões de indicadores (KPIs) — `IndicadoresKpi`, Dashboard e Orçamento do PCA, Armazenamento. */
export const GRADE_KPI = "grid grid-cols-1 gap-[var(--gap-block)] sm:grid-cols-2 lg:grid-cols-4";

/** Esqueleto dos INDICADORES (`IndicadoresKpi`): os quatro cartões principais na MESMA grade. */
export function EsqueletoIndicadores() {
  return (
    <div className={GRADE_KPI}>
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-[132px] rounded-card" />
      ))}
    </div>
  );
}

/**
 * Esqueleto da LINHA DAS TELAS INTERNAS (espaço do PCA, orçamento, pasta, órgão): o voltar à esquerda e, com `abas`, o
 * trilho das abas logo depois (o `EsqueletoSegmented`) — sem título (o nome está no caminho do cabeçalho). À direita, `fim`
 * selos (ex.: o ano e o status do PCA) e, com `config`, a engrenagem da Configuração — o mesmo arranjo do `AbasEspaco`.
 */
export function EsqueletoEspaco({ abas = 0, fim = 0, config = false }: { abas?: number; fim?: number; config?: boolean }) {
  return (
    <div className="linha-topico flex flex-wrap items-center gap-2">
      <EsqueletoControle quadrado />
      {abas > 0 && <EsqueletoSegmented itens={abas} />}
      {(fim > 0 || config) && (
        <div className="ml-auto flex items-center gap-2">
          {Array.from({ length: fim }, (_, i) => (
            <EsqueletoControle key={i} className={i === 0 ? "w-16" : "w-24"} />
          ))}
          {config && <EsqueletoControle quadrado />}
        </div>
      )}
    </div>
  );
}

/**
 * A COLUNA de uma aba de TABELA num espaço (PCA, Orçamento): até o fim do display no desktop — a altura abaixo da linha
 * do espaço (o voltar e as abas) —, para a `EsqueletoTabela cheia` chegar ao rodapé como a `scrollInterno`.
 */
export function EsqueletoColunaEspaco({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-[var(--gap-block)] lg:h-[max(240px,calc(100dvh-var(--h-header)-var(--pad-canvas-y)*3-var(--h-control-sm)))]">
      {children}
    </div>
  );
}

/**
 * A ESPERA DO CONTEÚDO DE UMA ABA (o `fallback` do Suspense das páginas dos espaços): o esqueleto da aba PEDIDA, com o
 * MESMO atraso de 450 ms da tela (a aba que chega antes entra direto, sem piscar).
 */
export function EsperaAba({ children }: { children: ReactNode }) {
  return (
    <div className="esqueleto-tela space-y-[var(--gap-block)]" aria-busy="true">
      <span className="sr-only" role="status">
        Carregando a aba…
      </span>
      {children}
    </div>
  );
}
