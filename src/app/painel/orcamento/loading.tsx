import { EsqueletoTela } from "@/components/EsqueletoTela";
import { EsqueletoOrcamentoCard, GRADE_ORCAMENTOS } from "@/components/OrcamentoCard";

/** Os orçamentos: a grade dos cards. */
export default function Carregando() {
  return (
    <EsqueletoTela>
      <div className={GRADE_ORCAMENTOS}>
        {Array.from({ length: 4 }).map((_, i) => (
          <EsqueletoOrcamentoCard key={i} />
        ))}
      </div>
    </EsqueletoTela>
  );
}
