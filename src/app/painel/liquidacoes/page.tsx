import { EmpenhosView } from "@/components/EmpenhosView";
import { acessoPagina } from "@/lib/acesso-pagina";
import { cardsDeEmpenhos, listarCards } from "@/lib/empenho-cards";
import { escopoDosEmpenhos } from "@/lib/empenhos-tela";

export const dynamic = "force-dynamic";

// LIQUIDAÇÕES (tela do módulo): a LISTA de cards — cada card importa as liquidações da Centi dos empenhos de um card de
// empenhos (a ORIGEM), com a própria configuração e a sua tabela no banco. Os números de cada card só com as liquidações
// do escopo da pessoa (a unidade do empenho).
export default async function LiquidacoesPage() {
  const r = await acessoPagina("liquidacoes");
  if (r.bloqueio) return r.bloqueio;
  const [cards, origens] = await Promise.all([listarCards(await escopoDosEmpenhos(), "liquidacoes"), cardsDeEmpenhos()]);
  return <EmpenhosView tipo="liquidacoes" cards={cards} origens={origens} podeCriar={r.pode.configurar} />;
}
