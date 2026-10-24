import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { EmpenhoCardConfig } from "@/components/EmpenhoCardConfig";
import { EmpenhoCardImportacao } from "@/components/EmpenhoCardImportacao";
import { EmpenhoCardPagamentos } from "@/components/EmpenhoCardPagamentos";
import { type AbaCard, EmpenhoCardView } from "@/components/EmpenhoCardView";
import { PermissaoExportar } from "@/components/ExportarTabelas";
import { acessoPagina } from "@/lib/acesso-pagina";
import { rotaDoCard } from "@/lib/empenho-cards-core";
import { getCard, listarCards } from "@/lib/empenho-cards";
import { escopoDosEmpenhos } from "@/lib/empenhos-tela";
import { chaveEscopoEmpenhos } from "@/lib/empenhos-tela-core";

export const dynamic = "force-dynamic";

// O ESPAÇO de um CARD de PAGAMENTOS: Pagamentos (a tabela gravada) · Importação (Importar — todos os órgãos do cadastro com
// o "ID na Centi" de uma vez, mês a mês) · Configuração (Configurar). O servidor monta SÓ a aba ativa (`?aba=`). A tabela segue o
// escopo da pessoa (o órgão/unidade de cada pagamento = os do EMPENHO de mesmo número).
export default async function PagamentoCardPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string }> }) {
  const r = await acessoPagina("pagamentos");
  if (r.bloqueio) return r.bloqueio;
  const { pode } = r;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const [sp, escopo] = await Promise.all([searchParams, escopoDosEmpenhos()]);
  const [card] = await listarCards(escopo, "pagamentos", id);
  if (!card) {
    // Um card de OUTRO tipo aberto pelo endereço de pagamentos vai à tela dele.
    const outro = await getCard(id);
    if (outro && outro.tipo !== "pagamentos") redirect(rotaDoCard(outro, sp.aba));
    notFound();
  }
  const permitidas: AbaCard[] = ["pagamentos", ...(pode.importar ? (["importacao"] as const) : []), ...(pode.configurar ? (["configuracao"] as const) : [])];
  const aba: AbaCard = permitidas.includes(sp.aba as AbaCard) ? (sp.aba as AbaCard) : "pagamentos";
  let conteudo: ReactNode;
  if (aba === "importacao") {
    conteudo = <EmpenhoCardImportacao card={card} podeExcluir={pode.excluir} />;
  } else if (aba === "configuracao") {
    conteudo = <EmpenhoCardConfig card={card} />;
  } else {
    conteudo = <EmpenhoCardPagamentos key={chaveEscopoEmpenhos(escopo)} cardId={id} nome={card.nome} />;
  }
  return (
    <EmpenhoCardView card={card} aba={aba} permitidas={permitidas} podeExcluir={pode.excluir}>
      <PermissaoExportar permitido={pode.exportar}>{conteudo}</PermissaoExportar>
    </EmpenhoCardView>
  );
}
