import { PermissaoExportar } from "@/components/ExportarTabelas";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { type AbaOrcamento, OrcamentoEspacoView } from "@/components/OrcamentoEspacoView";
import { OrcamentoComparativo } from "@/components/OrcamentoComparativo";
import { OrcamentoLancamentos } from "@/components/OrcamentoLancamentos";
import { OrcamentoVinculosAba } from "@/components/OrcamentoVinculosAba";
import { OrcamentoVisoes } from "@/components/OrcamentoVisoes";
import { acessoPagina } from "@/lib/acesso-pagina";
import { dadosComparativo } from "@/lib/comparativo-dados";
import { alvosVinculoOrcamento, getOrcamento, getOrcamentoItens, listarVinculosOrcamento } from "@/lib/orcamento";
import { DIMENSOES_ORCAMENTO, type LinhaOrcamentoVisao } from "@/lib/orcamento-visao";
import { listarVisoesOrcamento } from "@/lib/pca-espaco";
import { carregarEdicoes } from "@/lib/edicoes-tabela";
import { comVinculos } from "@/lib/orcamento-vinculo";
import { CHAVE_LANCAMENTOS } from "@/lib/edicoes-tabela-core";

export const dynamic = "force-dynamic";

const ABAS: AbaOrcamento[] = ["lancamentos", "comparativo", "vinculos", "visoes"];

// TELA DO ORÇAMENTO (aberta pelo card): Lançamentos · Comparativo · Vínculos · Visões. O servidor monta SÓ a aba ativa
// (`?aba=`) e manda ao cliente só os campos que ela usa.
export default async function OrcamentoEspacoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const r = await acessoPagina("orcamento");
  if (r.bloqueio) return r.bloqueio;
  const { pode, acesso } = r;
  const id = Number((await params).id);
  const sp = await searchParams;
  const orcamento = Number.isInteger(id) && id > 0 ? await getOrcamento(id) : null;
  if (!orcamento) notFound();
  const aba: AbaOrcamento = ABAS.includes(sp.aba as AbaOrcamento) ? (sp.aba as AbaOrcamento) : "lancamentos";
  let conteudo: ReactNode;
  if (aba === "visoes") {
    const [brutos, visoes, vinculos, alvos] = await Promise.all([getOrcamentoItens(id), listarVisoesOrcamento(), listarVinculosOrcamento(), alvosVinculoOrcamento()]);
    // Só as dimensões da visão (com a Unidade/Órgão do CADASTRO) + a dotação (a prévia do Σ).
    const itens = comVinculos(brutos, vinculos, alvos);
    const linhas = itens.map((i) => {
      const l: LinhaOrcamentoVisao & { valorInicial: number } = { valorInicial: i.valorInicial };
      for (const d of DIMENSOES_ORCAMENTO) l[d.key] = i[d.key];
      return l;
    });
    conteudo = <OrcamentoVisoes itens={linhas} visoes={visoes} podeEditar={pode.configurar} />;
  } else if (aba === "comparativo") {
    conteudo = (
      <OrcamentoComparativo titulo={`${orcamento.nome} ${orcamento.ano}`} {...await dadosComparativo(id, acesso.u.id)} podeExportar={pode.exportar} podePublicar={pode.configurar} />
    );
  } else if (aba === "vinculos") {
    const [itens, vinculos, alvos] = await Promise.all([getOrcamentoItens(id), listarVinculosOrcamento(), alvosVinculoOrcamento()]);
    conteudo = (
      <OrcamentoVinculosAba
        itens={itens.map((i) => ({ orgao: i.orgao, unidade: i.unidade, acao: i.acao, valorInicial: i.valorInicial }))}
        vinculos={vinculos}
        alvos={alvos}
        podeEditar={pode.configurar}
      />
    );
  } else {
    const [itens, vinculos, alvos, visoes, ed] = await Promise.all([
      getOrcamentoItens(id),
      listarVinculosOrcamento(),
      alvosVinculoOrcamento(),
      listarVisoesOrcamento(),
      carregarEdicoes(acesso.u.id, "orcamento-lancamentos:"),
    ]);
    conteudo = (
      <OrcamentoLancamentos
        orcamento={orcamento}
        pode={pode}
        itens={comVinculos(itens, vinculos, alvos)}
        visoes={visoes}
        edicoes={{ chave: CHAVE_LANCAMENTOS, lista: ed.lista, padroes: ed.padroes, podePublicar: pode.configurar }}
      />
    );
  }

  return (
    <OrcamentoEspacoView orcamento={orcamento} aba={aba} podeExcluir={pode.excluir}>
      <PermissaoExportar permitido={pode.exportar}>{conteudo}</PermissaoExportar>
    </OrcamentoEspacoView>
  );
}
