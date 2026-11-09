import type { AbaQuadro } from "./QuadroTarefas";
import { EsqueletoCalendario } from "./CalendarioEsqueleto";
import { DashboardMesaEsqueleto } from "./DashboardMesaEsqueleto";
import { EsqueletoTabela } from "./DataTableEsqueleto";
import { EsqueletoControle, Skeleton, SkeletonCartao } from "./Skeleton";

/** O respiro do `PainelMoldura` (as abas fora do Quadro): a margem e, embaixo, o lugar da pílula das vistas (68px). */
const PAINEL = "m-3 mb-[68px]";
const PAINEL_CHEIO = `${PAINEL} rounded-xl bg-surface p-3 shadow-soft`;

/** As LISTAS do quadro lado a lado, na largura da `ColunaTarefas` (no celular, uma por vez). */
function EsqueletoListas() {
  return (
    <div className="flex min-h-0 flex-1 gap-3 overflow-hidden px-3 pt-3 pb-[68px]">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-[60dvh] w-[min(88vw,20rem)] shrink-0 rounded-xl lg:h-full lg:w-[20rem]" />
      ))}
    </div>
  );
}

/**
 * ESQUELETO DE CADA ABA do quadro de Tarefas — o conteúdo DENTRO da moldura: as listas (Quadro), a tabela (Lista), o
 * calendário, o Dashboard (o mesmo do `dynamic`) ou as seções da Configuração. Usado pelo `ConteudoAba` na troca de aba e,
 * com a moldura, pelo `loading.tsx` (`EsqueletoQuadro`). Arquivo leve, sem "use client".
 */
export function EsqueletoAbaQuadro({ aba }: { aba: AbaQuadro }) {
  switch (aba) {
    case "quadro":
      return <EsqueletoListas />;
    case "lista":
      return (
        <div className={PAINEL_CHEIO}>
          <EsqueletoTabela linhas={10} colunas={7} />
        </div>
      );
    case "calendario":
      return (
        <div className={PAINEL_CHEIO}>
          <EsqueletoCalendario />
        </div>
      );
    case "dashboard":
      return (
        <div className={PAINEL}>
          <DashboardMesaEsqueleto />
        </div>
      );
    case "configuracao":
      return (
        <div className={`${PAINEL} space-y-[var(--gap-block)]`}>
          {[3, 2, 2].map((n, i) => (
            <SkeletonCartao key={i} linhas={n} />
          ))}
        </div>
      );
  }
}

/**
 * ESQUELETO DO QUADRO inteiro: a `MolduraQuadro` até o fim do display, a faixa do topo (voltar, nome e as ferramentas), o
 * conteúdo da aba e a pílula das vistas no rodapé. `aba={null}` = a moldura sem conteúdo (o `loading.tsx`, que não lê o
 * `?aba=`); com a aba, a espera da página.
 */
export function EsqueletoQuadro({ aba = "quadro" }: { aba?: AbaQuadro | null }) {
  return (
    <div className="relative flex min-h-[420px] min-w-0 flex-1 flex-col overflow-hidden rounded-2xl shadow-ring">
      <div className="flex min-h-14 shrink-0 items-center gap-2 border-b border-border px-2 sm:px-3">
        <EsqueletoControle quadrado />
        <Skeleton className="h-5 w-40 rounded-sm" />
        <div className="ml-auto flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <EsqueletoControle key={i} quadrado />
          ))}
        </div>
      </div>
      {aba ? <EsqueletoAbaQuadro aba={aba} /> : <div className="min-h-0 flex-1" />}
      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3">
        <Skeleton className="h-12 w-full max-w-sm rounded-xl lg:h-12" />
      </div>
    </div>
  );
}
