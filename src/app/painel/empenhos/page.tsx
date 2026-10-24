import { EmpenhosView } from "@/components/EmpenhosView";
import { acessoPagina } from "@/lib/acesso-pagina";
import { listarCards } from "@/lib/empenho-cards";
import { escopoDosEmpenhos } from "@/lib/empenhos-tela";

export const dynamic = "force-dynamic";

// EMPENHOS (tela do módulo): a LISTA de cards — cada card é uma importação da Centi com a própria configuração e a sua
// tabela no banco. Os números de cada card só com os empenhos do escopo da pessoa (a unidade do cabeçalho).
export default async function EmpenhosPage() {
  const r = await acessoPagina("empenhos");
  if (r.bloqueio) return r.bloqueio;
  const cards = await listarCards(await escopoDosEmpenhos());
  return <EmpenhosView cards={cards} podeCriar={r.pode.configurar} />;
}
