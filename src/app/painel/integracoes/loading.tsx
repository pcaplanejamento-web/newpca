import { EsqueletoTela, EsqueletoBarra } from "@/components/EsqueletoTela";
import { SkeletonCartao } from "@/components/Skeleton";

/** O título e o cartão da seção. */
export default function Carregando() {
  return (
    <EsqueletoTela>
      <EsqueletoBarra controles={0} icones={1} />
      <SkeletonCartao linhas={5} />
    </EsqueletoTela>
  );
}
