import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Callout } from "@/components/Callout";
import { EmpenhoCardConfig } from "@/components/EmpenhoCardConfig";
import { EmpenhoCardImportacao } from "@/components/EmpenhoCardImportacao";
import { EmpenhoCardLiquidacoes } from "@/components/EmpenhoCardLiquidacoes";
import { type AbaCard, EmpenhoCardView } from "@/components/EmpenhoCardView";
import { EmpenhoCardVinculos } from "@/components/EmpenhoCardVinculos";
import { PermissaoExportar } from "@/components/ExportarTabelas";
import { acessoPagina } from "@/lib/acesso-pagina";
import { anosDoCard, rotaDoCard } from "@/lib/empenho-cards-core";
import { cadastroParaVinculos, cardsDeEmpenhos, catalogoCenti, getCard, listarCards, orgaosLiquidacao, vinculosDoCard } from "@/lib/empenho-cards";
import { usaPeriodo } from "@/lib/empenhos-core";
import { escopoDosEmpenhos } from "@/lib/empenhos-tela";
import { chaveEscopoEmpenhos } from "@/lib/empenhos-tela-core";
import { dataIsoBrasilia } from "@/lib/format";

export const dynamic = "force-dynamic";

// O ESPAÇO de um CARD de LIQUIDAÇÕES: Liquidações (a tabela gravada) · Vínculos (os do card de empenhos de origem, só
// leitura) · Importação (Importar) · Configuração (Configurar). O servidor monta SÓ a aba ativa (`?aba=`). A tabela segue
// o escopo da pessoa (a unidade do empenho de cada liquidação).
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
    if (card.origemId == null) {
      conteudo = <Callout kind="warn">Escolha na Configuração o card de empenhos de origem — os vínculos das liquidações são os dele.</Callout>;
    } else {
      const origem = card.origemId;
      const [vinculos, catalogo, cadastro, orgaos] = await Promise.all([vinculosDoCard(origem), catalogoCenti(), cadastroParaVinculos(), orgaosLiquidacao(card)]);
      conteudo = (
        <>
          <Callout kind="info">
            <p>
              Os vínculos das liquidações são os do card de empenhos <strong>{card.origemNome ?? `#${origem}`}</strong>: a liquidação só é gravada
              quando o empenho dela está lá e segue a unidade dele.{" "}
              <Link href={rotaDoCard({ id: origem, tipo: "empenhos" }, "vinculos")} className="font-semibold underline underline-offset-2">
                Editar no card de empenhos
              </Link>
            </p>
            <p className="mt-1">
              {orgaos.orgaos.length
                ? `Órgãos da Centi pedidos: ${orgaos.orgaos.map((o) => `${o.id} (${o.nome})`).join(", ")}.`
                : "Nenhum órgão de destino dos vínculos tem o ID na Centi cadastrado — as liquidações não podem ser pedidas."}
              {orgaos.semId.length > 0 && ` Sem o ID na Centi (não lidos): ${orgaos.semId.join(", ")} — cadastre em Órgãos e Unidades.`}
            </p>
          </Callout>
          <EmpenhoCardVinculos
            cardId={origem}
            anos={anosDoCard(card.anos, Number(dataIsoBrasilia(new Date().toISOString()).slice(0, 4)))}
            vinculos={vinculos}
            catalogo={catalogo}
            cadastro={cadastro}
            podeEditar={false}
            comPeriodo={usaPeriodo(card.parametros)}
            podeBuscar={false}
            configurado
          />
        </>
      );
    }
  } else if (aba === "importacao") {
    conteudo = <EmpenhoCardImportacao card={card} podeExcluir={pode.excluir} />;
  } else if (aba === "configuracao") {
    conteudo = <EmpenhoCardConfig card={card} origens={await cardsDeEmpenhos()} />;
  } else {
    conteudo = <EmpenhoCardLiquidacoes key={chaveEscopoEmpenhos(escopo)} cardId={id} nome={card.nome} />;
  }
  return (
    <EmpenhoCardView card={card} aba={aba} permitidas={permitidas} podeExcluir={pode.excluir}>
      <PermissaoExportar permitido={pode.exportar}>{conteudo}</PermissaoExportar>
    </EmpenhoCardView>
  );
}
