import { EsqueletoGradeEspacos } from "@/components/CartaoEspacoEsqueleto";
import { EsqueletoEspaco, EsqueletoTela } from "@/components/EsqueletoTela";
import { Skeleton } from "@/components/Skeleton";

/** A pasta do catálogo: os números da pasta, a linha da pasta (voltar e nome) e a grade dos catálogos. */
export default function Carregando() {
  return (
    <EsqueletoTela>
      <div className="grid grid-cols-2 gap-[var(--gap-block)] sm:grid-cols-3 xl:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-[72px] rounded-card" />
        ))}
      </div>
      <EsqueletoEspaco />
      <EsqueletoGradeEspacos espaco="gap-3" />
    </EsqueletoTela>
  );
}
