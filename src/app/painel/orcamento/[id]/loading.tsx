import { EsqueletoEspaco, EsqueletoIndicadores, EsqueletoTela } from "@/components/EsqueletoTela";

/**
 * O espaço do orçamento: a linha (o voltar, as abas e o excluir) e os indicadores — valem para QUALQUER aba. O conteúdo
 * da aba vem no Suspense da página, com o esqueleto da aba pedida (`?aba=`), que este arquivo não consegue ler.
 */
export default function Carregando() {
  return (
    <EsqueletoTela>
      <EsqueletoEspaco abas={4} config />
      <EsqueletoIndicadores />
    </EsqueletoTela>
  );
}
