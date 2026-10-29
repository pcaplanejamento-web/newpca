import { EsqueletoTela, EsqueletoBarra } from "@/components/EsqueletoTela";
import { SkeletonCartao } from "@/components/Skeleton";

/** o cartão da seção. */
export default function Carregando() {
  return (
    <EsqueletoTela>
      <EsqueletoBarra controles={1} icones={1} />
      <SkeletonCartao linhas={5} />
    </EsqueletoTela>
  );
}
