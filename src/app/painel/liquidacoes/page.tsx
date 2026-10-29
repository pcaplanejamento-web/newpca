import { EmpenhoCardLiquidacoes } from "@/components/EmpenhoCardLiquidacoes";
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

// LIQUIDAÇÕES (tela do módulo): só os DADOS — a TABELA ÚNICA de todos os cards (a mesma liquidação uma vez). As importações
// ficam em Configurações → Importações. Tudo no escopo da pessoa (o órgão/unidade do EMPENHO de mesmo número).
export default async function LiquidacoesPage() {
  const r = await acessoPagina("liquidacoes");
  if (r.bloqueio) return r.bloqueio;
  const escopo = await escopoDosEmpenhos();
  const cards = await listarCards(escopo, "liquidacoes");
  const versao = await consultaVersoesExecucao(getDb()).then((v) => versaoDaTelaExecucao(v, "liquidacoes"));
  return (
    <EmpenhosView tipo="liquidacoes" total={cards.reduce((t, c) => t + c.empenhos, 0)} importacoes={r.acesso.u.admin ? linkImportacoes("liquidacoes") : undefined}>
      <PermissaoExportar permitido={r.pode.exportar}>
        <EmpenhoCardLiquidacoes key={chaveEscopoEmpenhos(escopo)} cardId={null} nome="Liquidações - todos os cards" cards={Object.fromEntries(cards.map((c) => [c.id, c.nome]))} versao={`${versao}|${chaveEscopoEmpenhos(escopo)}`} />
      </PermissaoExportar>
    </EmpenhosView>
  );
}
