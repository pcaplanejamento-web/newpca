import { EsqueletoTela, EsqueletoTitulo } from "@/components/EsqueletoTela";
import { EsqueletoPcaCard, GRADE_PCAS } from "@/components/PcaCard";

/** Os PCAs: o título e a grade dos cards 4:5. */
export default function Carregando() {
  return (
    <EsqueletoTela>
      <EsqueletoTitulo acao={false} />
      <div className={GRADE_PCAS}>
        {Array.from({ length: 3 }).map((_, i) => (
          <EsqueletoPcaCard key={i} />
        ))}
      </div>
    </EsqueletoTela>
  );
}
