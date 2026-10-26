import { EmpenhoCardLiquidacoes } from "@/components/EmpenhoCardLiquidacoes";
import { type AbaModuloEmpenhos, EmpenhosView } from "@/components/EmpenhosView";
import { PermissaoExportar } from "@/components/ExportarTabelas";
import { acessoPagina } from "@/lib/acesso-pagina";
import { getDb } from "@/lib/db";
import { listarCards } from "@/lib/empenho-cards";
import { escopoDosEmpenhos } from "@/lib/empenhos-tela";
import { chaveEscopoEmpenhos } from "@/lib/empenhos-tela-core";
import { consultaVersaoExecucao } from "@/lib/execucao-sql";

export const dynamic = "force-dynamic";

// LIQUIDAÇÕES (tela do módulo): abre em DADOS — a TABELA ÚNICA de todos os cards (a mesma liquidação uma vez) — e troca para
// IMPORTAÇÕES = a lista de cards (cada um importa da Centi com a própria configuração). O servidor monta só a aba ativa
// (`?aba=`). Tudo no escopo da pessoa (o órgão/unidade do EMPENHO de mesmo número).
export default async function LiquidacoesPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const r = await acessoPagina("liquidacoes");
  if (r.bloqueio) return r.bloqueio;
  const [sp, escopo] = await Promise.all([searchParams, escopoDosEmpenhos()]);
  const aba: AbaModuloEmpenhos = sp.aba === "importacoes" ? "importacoes" : "dados";
  const cards = await listarCards(escopo, "liquidacoes");
  if (aba === "importacoes") return <EmpenhosView tipo="liquidacoes" cards={cards} podeCriar={r.pode.configurar} aba={aba} />;
  const versao = await consultaVersaoExecucao(getDb());
  return (
    <EmpenhosView tipo="liquidacoes" cards={cards} podeCriar={r.pode.configurar} aba={aba}>
      <PermissaoExportar permitido={r.pode.exportar}>
        <EmpenhoCardLiquidacoes key={chaveEscopoEmpenhos(escopo)} cardId={null} nome="Liquidações - todos os cards" cards={Object.fromEntries(cards.map((c) => [c.id, c.nome]))} versao={versao} />
      </PermissaoExportar>
    </EmpenhosView>
  );
}
