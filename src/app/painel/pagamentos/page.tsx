import { EmpenhosView } from "@/components/EmpenhosView";
import { acessoPagina } from "@/lib/acesso-pagina";
import { listarCards } from "@/lib/empenho-cards";
import { escopoDosEmpenhos } from "@/lib/empenhos-tela";

export const dynamic = "force-dynamic";

// PAGAMENTOS (tela do módulo): a LISTA de cards — cada card importa os pagamentos (ordens de pagamento) da Centi de todos os
// órgãos com o "ID na Centi", mês a mês, com a própria configuração e a sua tabela no banco. Os números de cada card só com
// os pagamentos do escopo da pessoa (o órgão/unidade do EMPENHO de mesmo número).
export default async function PagamentosPage() {
  const r = await acessoPagina("pagamentos");
  if (r.bloqueio) return r.bloqueio;
  const cards = await listarCards(await escopoDosEmpenhos(), "pagamentos");
  return <EmpenhosView tipo="pagamentos" cards={cards} podeCriar={r.pode.configurar} />;
}
