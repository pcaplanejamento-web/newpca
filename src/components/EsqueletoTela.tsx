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
      className={`esqueleto-tela ${cheia ? "flex flex-col gap-[var(--gap-block)] lg:h-[calc(100dvh-var(--h-header)-var(--pad-canvas-y)*2)]" : "space-y-[var(--gap-block)]"}`}
      aria-busy="true"
    >
      <span className="sr-only" role="status">
        Carregando a tela…
      </span>
      {children}
    </div>
  );
}

/** Esqueleto da LINHA DE TÍTULO de uma tela (`.linha-topico`: o título e, à direita, a ação da tela). */
export function EsqueletoTitulo({ acao = true }: { acao?: boolean }) {
  return (
    <div className="linha-topico flex items-center gap-3">
      <Skeleton className="h-7 w-44 max-w-[60%]" />
      {acao && <EsqueletoControle className="ml-auto w-28" />}
    </div>
  );
}
