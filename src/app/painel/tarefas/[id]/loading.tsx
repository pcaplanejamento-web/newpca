import { EsqueletoTela } from "@/components/EsqueletoTela";
import { Skeleton } from "@/components/Skeleton";

/** O quadro: a moldura até o fim do display com as listas lado a lado (a faixa do quadro no topo). */
export default function Carregando() {
  return (
    <EsqueletoTela cheia>
      <div className="flex min-h-0 flex-1 flex-col gap-3 rounded-2xl border border-border p-3">
        <Skeleton className="h-10 w-full rounded-control" />
        <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-full w-[17.5rem] shrink-0 rounded-xl" />
          ))}
        </div>
      </div>
    </EsqueletoTela>
  );
}
