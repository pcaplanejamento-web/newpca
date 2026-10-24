import { EmpenhosView } from "@/components/EmpenhosView";
import { acessoPagina } from "@/lib/acesso-pagina";
import { listarCards } from "@/lib/empenho-cards";
import { escopoDosEmpenhos } from "@/lib/empenhos-tela";

export const dynamic = "force-dynamic";

// LIQUIDAÇÕES (tela do módulo): a LISTA de cards — cada card importa as liquidações da Centi dos PRÓPRIOS órgãos (um órgão
// por importação), com a própria configuração e a sua tabela no banco — independente dos empenhos. Os números de cada card
// só com as liquidações do escopo da pessoa (o órgão/unidade de destino).
export default async function LiquidacoesPage() {
  const r = await acessoPagina("liquidacoes");
  if (r.bloqueio) return r.bloqueio;
  const cards = await listarCards(await escopoDosEmpenhos(), "liquidacoes");
  return <EmpenhosView tipo="liquidacoes" cards={cards} podeCriar={r.pode.configurar} />;
}
