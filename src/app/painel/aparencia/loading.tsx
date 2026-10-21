import { EsqueletoTela, EsqueletoTitulo } from "@/components/EsqueletoTela";
import { SkeletonCartao } from "@/components/Skeleton";

/** O título e o cartão da seção. */
export default function Carregando() {
  return (
    <EsqueletoTela>
      <EsqueletoTitulo acao={false} />
      <SkeletonCartao linhas={5} />
    </EsqueletoTela>
  );
}
