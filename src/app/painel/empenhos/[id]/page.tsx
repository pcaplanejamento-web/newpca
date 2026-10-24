import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { EmpenhoCardConfig } from "@/components/EmpenhoCardConfig";
import { EmpenhoCardImportacao } from "@/components/EmpenhoCardImportacao";
import { type AbaCard, EmpenhoCardView } from "@/components/EmpenhoCardView";
import { EmpenhoCardVinculos } from "@/components/EmpenhoCardVinculos";
import { EmpenhosTabela } from "@/components/EmpenhosTabela";
import { PermissaoExportar } from "@/components/ExportarTabelas";
import { acessoPagina } from "@/lib/acesso-pagina";
import { carregarEdicoes } from "@/lib/edicoes-tabela";
import { anosDoCard, orgaosDaLeitura, rotaDoCard } from "@/lib/empenho-cards-core";
import { cadastroParaVinculos, catalogoCenti, conflitosEntreCards, getCard, listarCards, mapaOrgaosGestores, vinculosDoCard } from "@/lib/empenho-cards";
import { anosEmpenhos, escopoDosEmpenhos } from "@/lib/empenhos-tela";
import { anoEscolhido, chaveEscopoEmpenhos } from "@/lib/empenhos-tela-core";
import { dataIsoBrasilia } from "@/lib/format";
import { usaPeriodo } from "@/lib/empenhos-core";

export const dynamic = "force-dynamic";

// O ESPAÇO de um CARD de empenhos: Empenhos (a tabela gravada) · Vínculos · Importação (Importar) · Configuração
// (Configurar). O servidor monta SÓ a aba ativa (`?aba=`). A tabela segue o escopo da pessoa (a unidade do cabeçalho):
// trocar a unidade remonta a aba (a `key`), sem os anos guardados do escopo anterior.
export default async function EmpenhoCardPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string; ano?: string }> }) {
  const r = await acessoPagina("empenhos");
  if (r.bloqueio) return r.bloqueio;
  const { pode, acesso } = r;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const [sp, escopo] = await Promise.all([searchParams, escopoDosEmpenhos()]);
  const [card] = await listarCards(escopo, "empenhos", id);
  if (!card) {
    // Um card de LIQUIDAÇÕES ou PAGAMENTOS aberto pelo endereço de empenhos vai à tela dele.
    const outro = await getCard(id);
    if (outro && outro.tipo !== "empenhos") redirect(rotaDoCard(outro, sp.aba));
    notFound();
  }
  const permitidas: AbaCard[] = ["empenhos", "vinculos", ...(pode.importar ? (["importacao"] as const) : []), ...(pode.configurar ? (["configuracao"] as const) : [])];
  const aba: AbaCard = permitidas.includes(sp.aba as AbaCard) ? (sp.aba as AbaCard) : "empenhos";
  let conteudo: ReactNode;
  if (aba === "vinculos") {
    const [vinculos, catalogo, cadastro, conflitos, mapa] = await Promise.all([vinculosDoCard(id), catalogoCenti(), cadastroParaVinculos(), conflitosEntreCards(id), mapaOrgaosGestores()]);
    conteudo = (
      <EmpenhoCardVinculos
        cardId={id}
        anos={anosDoCard(card.anos, Number(dataIsoBrasilia(new Date().toISOString()).slice(0, 4)))}
        vinculos={vinculos}
        catalogo={catalogo}
        cadastro={cadastro}
        conflitos={conflitos}
        mapa={mapa}
        porOrgao={card.porOrgao}
        podeEditar={pode.configurar}
        comPeriodo={usaPeriodo(card.parametros)}
        podeBuscar={pode.importar}
        configurado={!!card.configuradoEm}
      />
    );
  } else if (aba === "importacao") {
    conteudo = <EmpenhoCardImportacao card={card} podeExcluir={pode.excluir} />;
  } else if (aba === "configuracao") {
    const [vinculos, mapa] = await Promise.all([vinculosDoCard(id), mapaOrgaosGestores()]);
    conteudo = <EmpenhoCardConfig card={card} leitura={orgaosDaLeitura(vinculos, mapa)} />;
  } else {
    const [anos, edicoes] = await Promise.all([anosEmpenhos(id, escopo), carregarEdicoes(acesso.u.id, "empenhos:")]);
    conteudo = (
      <EmpenhosTabela
        key={chaveEscopoEmpenhos(escopo)}
        cardId={id}
        nome={card.nome}
        escopo={escopo}
        anos={anos}
        anoInicial={anoEscolhido(anos, sp.ano)}
        edicoes={edicoes}
        podePublicar={pode.configurar}
      />
    );
  }
  return (
    <EmpenhoCardView card={card} aba={aba} permitidas={permitidas} podeExcluir={pode.excluir}>
      <PermissaoExportar permitido={pode.exportar}>{conteudo}</PermissaoExportar>
    </EmpenhoCardView>
  );
}
