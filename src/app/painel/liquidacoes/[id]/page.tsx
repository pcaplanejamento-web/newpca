import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { EmpenhoCardConfig } from "@/components/EmpenhoCardConfig";
import { EmpenhoCardImportacao } from "@/components/EmpenhoCardImportacao";
import { EmpenhoCardLiquidacoes } from "@/components/EmpenhoCardLiquidacoes";
import { type AbaCard, EmpenhoCardView } from "@/components/EmpenhoCardView";
import { PermissaoExportar } from "@/components/ExportarTabelas";
import { LiquidacaoCardOrgaos } from "@/components/LiquidacaoCardOrgaos";
import { acessoPagina } from "@/lib/acesso-pagina";
import { rotaDoCard } from "@/lib/empenho-cards-core";
import { cadastroParaVinculos, getCard, listarCards, orgaosDoCard } from "@/lib/empenho-cards";
import { escopoDosEmpenhos } from "@/lib/empenhos-tela";
import { chaveEscopoEmpenhos } from "@/lib/empenhos-tela-core";

export const dynamic = "force-dynamic";

// O ESPAÇO de um CARD de LIQUIDAÇÕES: Liquidações (a tabela gravada) · Órgãos (os órgãos da Centi do card, cada um com o
// destino) · Importação (Importar — um órgão por vez) · Configuração (Configurar). O servidor monta SÓ a aba ativa (`?aba=`).
// A tabela segue o escopo da pessoa (o órgão/unidade de destino de cada liquidação).
export default async function LiquidacaoCardPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string }> }) {
  const r = await acessoPagina("liquidacoes");
  if (r.bloqueio) return r.bloqueio;
  const { pode } = r;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const [sp, escopo] = await Promise.all([searchParams, escopoDosEmpenhos()]);
  const [card] = await listarCards(escopo, "liquidacoes", id);
  if (!card) {
    // Um card de EMPENHOS aberto pelo endereço de liquidações vai à tela dele.
    const outro = await getCard(id);
    if (outro?.tipo === "empenhos") redirect(rotaDoCard(outro, sp.aba));
    notFound();
  }
  const permitidas: AbaCard[] = ["liquidacoes", "vinculos", ...(pode.importar ? (["importacao"] as const) : []), ...(pode.configurar ? (["configuracao"] as const) : [])];
  const aba: AbaCard = permitidas.includes(sp.aba as AbaCard) ? (sp.aba as AbaCard) : "liquidacoes";
  let conteudo: ReactNode;
  if (aba === "vinculos") {
    const [orgaos, cadastro] = await Promise.all([orgaosDoCard(id), cadastroParaVinculos()]);
    conteudo = <LiquidacaoCardOrgaos cardId={id} orgaos={orgaos} cadastro={cadastro} podeEditar={pode.configurar} />;
  } else if (aba === "importacao") {
    conteudo = <EmpenhoCardImportacao card={card} podeExcluir={pode.excluir} />;
  } else if (aba === "configuracao") {
    conteudo = <EmpenhoCardConfig card={card} />;
  } else {
    conteudo = <EmpenhoCardLiquidacoes key={chaveEscopoEmpenhos(escopo)} cardId={id} nome={card.nome} />;
  }
  return (
    <EmpenhoCardView card={card} aba={aba} permitidas={permitidas} podeExcluir={pode.excluir}>
      <PermissaoExportar permitido={pode.exportar}>{conteudo}</PermissaoExportar>
    </EmpenhoCardView>
  );
}
