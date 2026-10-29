import { EmpenhoCardPagamentos } from "@/components/EmpenhoCardPagamentos";
import { EmpenhosView } from "@/components/EmpenhosView";
import { PermissaoExportar } from "@/components/ExportarTabelas";
import { acessoPagina } from "@/lib/acesso-pagina";
import { getDb } from "@/lib/db";
import { linkImportacoes } from "@/lib/empenho-cards-core";
import { listarCards } from "@/lib/empenho-cards";
import { escopoDosEmpenhos } from "@/lib/empenhos-tela";
import { chaveEscopoEmpenhos } from "@/lib/empenhos-tela-core";
import { consultaVersoesExecucao, versaoDaTelaExecucao } from "@/lib/execucao-sql";

export const dynamic = "force-dynamic";

// PAGAMENTOS (tela do módulo): só os DADOS — a TABELA ÚNICA de todos os cards (o mesmo pagamento uma vez). As importações
// ficam em Configurações → Importações. Tudo no escopo da pessoa (o órgão/unidade do EMPENHO de mesmo número).
export default async function PagamentosPage() {
  const r = await acessoPagina("pagamentos");
  if (r.bloqueio) return r.bloqueio;
  const escopo = await escopoDosEmpenhos();
  const cards = await listarCards(escopo, "pagamentos");
  const versao = await consultaVersoesExecucao(getDb()).then((v) => versaoDaTelaExecucao(v, "pagamentos"));
  return (
    <EmpenhosView tipo="pagamentos" importacoes={r.acesso.u.admin ? linkImportacoes("pagamentos") : undefined}>
      <PermissaoExportar permitido={r.pode.exportar}>
        <EmpenhoCardPagamentos key={chaveEscopoEmpenhos(escopo)} cardId={null} nome="Pagamentos - todos os cards" cards={Object.fromEntries(cards.map((c) => [c.id, c.nome]))} versao={`${versao}|${chaveEscopoEmpenhos(escopo)}`} />
      </PermissaoExportar>
    </EmpenhosView>
  );
}
