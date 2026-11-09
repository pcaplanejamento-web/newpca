import { EsqueletoEspaco, EsqueletoTela } from "@/components/EsqueletoTela";

/**
 * O espaço do PCA: só a linha (o voltar, as abas, o ano, o status e a engrenagem) — vale para QUALQUER aba. O conteúdo
 * vem no Suspense da página, com o esqueleto da aba pedida (`?aba=`), que este arquivo não consegue ler.
 */
export default function Carregando() {
  return (
    <EsqueletoTela>
      <EsqueletoEspaco abas={5} fim={2} config />
    </EsqueletoTela>
  );
}
