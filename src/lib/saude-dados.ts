import { getCloudflareContext } from "@opennextjs/cloudflare";
import { linkProtocolo } from "./avisos-mesa";
import { getRegrasAvaliacao } from "./avaliacao";
import { avaliarSaude, type SaudeDados } from "./saude-dados-core";
import { consultarSaude } from "./saude-dados-sql";
import { memoPorVersao } from "./versao-dados";

/**
 * A SAÚDE DOS DADOS (só ADM, tela Armazenamento): as 5 consultas de leitura no binding D1 cru + a classificação pura com
 * as regras do ADM (a capa pela MESMA régua da Mesa). Memorizada pela versão dos dados; `fresco` (o "Verificar") refaz.
 */
export async function saudeDosDados(opcoes: { fresco?: boolean } = {}): Promise<SaudeDados> {
  const carregar = async () => {
    const [entrada, regras] = await Promise.all([consultarSaude(getCloudflareContext().env.DB), getRegrasAvaliacao()]);
    return avaliarSaude(entrada, regras, linkProtocolo, new Date());
  };
  return opcoes.fresco ? carregar() : memoPorVersao("saude-dados", carregar);
}
