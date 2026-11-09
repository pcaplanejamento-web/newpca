import { EsqueletoDropzone } from "@/components/DropzoneEsqueleto";
import { EsqueletoTela } from "@/components/EsqueletoTela";
import { EsqueletoSegmented } from "@/components/SegmentedEsqueleto";
import { EsqueletoControle } from "@/components/Skeleton";

/** A Verificação: Protocolo | DFD (e a ajuda à direita) e a área para soltar o arquivo. */
export default function Carregando() {
  return (
    <EsqueletoTela>
      <div className="linha-topico flex flex-wrap items-center gap-2">
        <EsqueletoSegmented itens={2} />
        <EsqueletoControle quadrado className="ml-auto" />
      </div>
      <EsqueletoDropzone />
    </EsqueletoTela>
  );
}
