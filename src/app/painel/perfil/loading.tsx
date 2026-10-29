import { EsqueletoTela } from "@/components/EsqueletoTela";
import { Skeleton } from "@/components/Skeleton";
import { EsqueletoTabsLaterais } from "@/components/TabsEsqueleto";

/** O cabeçalho da pessoa (foto e nome) e as abas laterais (a lista num cartão, o conteúdo noutro). */
export default function Carregando() {
  return (
    <EsqueletoTela cheia>
      <div className="flex items-center gap-3">
        <Skeleton className="h-14 w-14 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <EsqueletoTabsLaterais />
    </EsqueletoTela>
  );
}
