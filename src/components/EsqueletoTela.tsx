import type { ReactNode } from "react";
import { Skeleton, SkeletonLinhas } from "./Skeleton";

/**
 * As formas de tela: `mesa` = barra + tabela até o fim do display · `pca`/`orcamento`/`espacos`
 * = título + a grade de cartões de cada uma (PCA 4:5 · orçamento · quadros, catálogos e automações) · `calendario` = barra +
 * lateral + grade do mês · `abas` = título + abas laterais (Configurações, Perfil) · `painel` = título + um bloco.
 */
export type VarianteEsqueleto = "mesa" | "pca" | "orcamento" | "espacos" | "calendario" | "abas" | "painel";

/** Do topo do conteúdo até o fim do display no desktop (o cabeçalho e o respiro de cima e de baixo do `<main>`). */
const ATE_O_FIM = "lg:h-[calc(100dvh-var(--h-header)-var(--pad-canvas-y)*2)]";
const CONTROLE = "h-11 lg:h-[var(--h-control-sm)]";
const MOLDURA = "rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring";

/** As grades de cartões, nas MESMAS medidas das telas reais (texto fixo — o Tailwind precisa ver as classes). */
const GRADES = {
  pca: { grade: "grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))]", cartao: "aspect-[4/5] max-w-[30rem]" },
  orcamento: { grade: "grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))]", cartao: "min-h-[16rem]" },
  espacos: { grade: "grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))]", cartao: "h-60" },
} as const;

function Titulo() {
  return (
    <div className="linha-topico flex items-center gap-3">
      <Skeleton className="h-7 w-44 max-w-[60%]" />
      <Skeleton className={`ml-auto w-28 ${CONTROLE}`} />
    </div>
  );
}

function Barra() {
  return (
    <div className="flex items-center gap-2">
      <Skeleton className={`w-72 max-w-[70%] ${CONTROLE}`} />
      <Skeleton className={`ml-auto aspect-square ${CONTROLE}`} />
      <Skeleton className={`aspect-square ${CONTROLE}`} />
    </div>
  );
}

/** Tabela/bloco que vai até o fim do display no desktop (no celular, as linhas). */
function Bloco({ linhas }: { linhas: number }) {
  return (
    <div className={`${MOLDURA} min-h-0 overflow-hidden lg:flex-1`}>
      <SkeletonLinhas linhas={linhas} />
    </div>
  );
}

function Cheia({ children }: { children: ReactNode }) {
  return <div className={`flex flex-col gap-[var(--gap-block)] ${ATE_O_FIM}`}>{children}</div>;
}

/**
 * ESQUELETO DE UMA TELA — o `loading.tsx` da rota: a ESTRUTURA da tela (título, barra e a moldura do conteúdo, nos mesmos
 * espaçamentos e medidas das telas reais), sem nenhum dado e sem pedir nada ao servidor. SÓ APARECE QUANDO A TELA DEMORA
 * (`.esqueleto-tela`: invisível nos primeiros 450 ms) — a que chega antes entra direto; as já vistas voltam do cache.
 */
export function EsqueletoTela({ variante }: { variante: VarianteEsqueleto }) {
  let corpo: ReactNode;
  if (variante === "mesa") {
    corpo = (
      <Cheia>
        <Barra />
        <Bloco linhas={12} />
      </Cheia>
    );
  } else if (variante === "calendario") {
    corpo = (
      <Cheia>
        <Barra />
        <div className="flex min-h-0 gap-[var(--gap-block)] lg:flex-1">
          <Skeleton className="hidden w-64 shrink-0 rounded-card lg:block" />
          <div className={`${MOLDURA} grid flex-1 grid-cols-7 gap-1 lg:grid-rows-5`}>
            {Array.from({ length: 35 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-md lg:h-full" />
            ))}
          </div>
        </div>
      </Cheia>
    );
  } else if (variante === "abas") {
    corpo = (
      <Cheia>
        <Titulo />
        <div className="flex min-h-0 flex-col gap-[var(--gap-block)] lg:flex-1 lg:flex-row">
          <div className={`${MOLDURA} space-y-2 lg:w-60 lg:shrink-0`}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded-control" />
            ))}
          </div>
          <Bloco linhas={6} />
        </div>
      </Cheia>
    );
  } else if (variante === "painel") {
    corpo = (
      <Cheia>
        <Titulo />
        <Bloco linhas={5} />
      </Cheia>
    );
  } else {
    const g = GRADES[variante];
    corpo = (
      <div className="space-y-[var(--gap-block)]">
        <Titulo />
        <div className={`grid gap-[var(--gap-block)] ${g.grade}`}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className={`w-full rounded-card ${g.cartao}`} />
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="esqueleto-tela" aria-busy="true">
      <span className="sr-only" role="status">
        Carregando a tela…
      </span>
      {corpo}
    </div>
  );
}
