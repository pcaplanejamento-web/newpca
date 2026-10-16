import { PermissaoExportar } from "@/components/ExportarTabelas";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { type AbaOrcamento, OrcamentoEspacoView } from "@/components/OrcamentoEspacoView";
import { OrcamentoComparativo } from "@/components/OrcamentoComparativo";
import { OrcamentoLancamentos } from "@/components/OrcamentoLancamentos";
import { OrcamentoVinculosAba } from "@/components/OrcamentoVinculosAba";
import { OrcamentoVisoes } from "@/components/OrcamentoVisoes";
import { componenteLibera } from "@/lib/acesso";
import { acessoPagina } from "@/lib/acesso-pagina";
import { dadosComparativo, lancamentosDaUnidade, resumoDosLancamentos } from "@/lib/comparativo-dados";
import { unidadeDoModulo } from "@/lib/escopo-cabecalho";
import { alvosVinculoOrcamento, getOrcamento, getOrcamentoItens, listarVinculosOrcamento } from "@/lib/orcamento";
import { DIMENSOES_ORCAMENTO, type LinhaOrcamentoVisao } from "@/lib/orcamento-visao";
import { listarVisoesOrcamento } from "@/lib/pca-espaco";
import { carregarEdicoes } from "@/lib/edicoes-tabela";
import { comVinculos, vinculosDaVisao } from "@/lib/orcamento-vinculo";
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
  const [orcBanco, rep] = await Promise.all([Number.isInteger(id) && id > 0 ? getOrcamento(id) : null, unidadeDoModulo("orcamento")]);
  if (!orcBanco) notFound();
  // A unidade do CABEÇALHO (Configurações → Filtro da unidade): Lançamentos, Comparativo, Visões e o cabeçalho só com os
  // lançamentos vinculados a ela. Os Vínculos (a configuração) seguem com o orçamento inteiro.
  const repOrc = rep.id === null ? null : { id: rep.id, semVinculo: rep.cfg.orcamentoSemVinculo };
  let escopo: Promise<{ itens: Awaited<ReturnType<typeof getOrcamentoItens>>; vinculos: Awaited<ReturnType<typeof listarVinculosOrcamento>> }> | null = null;
  const doEscopo = () =>
    (escopo ??= Promise.all([getOrcamentoItens(id), listarVinculosOrcamento()]).then(([brutos, vinculos]) => ({
      itens: lancamentosDaUnidade(brutos, vinculos, repOrc),
      vinculos,
    })));
  const orcamento = repOrc ? resumoDosLancamentos(orcBanco, (await doEscopo()).itens) : orcBanco;
  const permitidas = ABAS.filter((a) => componenteLibera(acesso, `orcamento.${a}`));
  const aba: AbaOrcamento = permitidas.includes(sp.aba as AbaOrcamento) ? (sp.aba as AbaOrcamento) : (permitidas[0] ?? "lancamentos");
  let conteudo: ReactNode;
  if (aba === "visoes") {
    const [{ itens: brutos, vinculos }, visoes, alvos] = await Promise.all([doEscopo(), listarVisoesOrcamento(), alvosVinculoOrcamento()]);
    // Só as dimensões da visão (com a Unidade/Órgão do CADASTRO) + a dotação (a prévia do Σ).
    const itens = comVinculos(brutos, vinculosDaVisao(vinculos, null), alvos);
    const linhas = itens.map((i) => {
      const l: LinhaOrcamentoVisao & { valorInicial: number } = { valorInicial: i.valorInicial };
      for (const d of DIMENSOES_ORCAMENTO) l[d.key] = i[d.key];
      return l;
    });
    conteudo = <OrcamentoVisoes itens={linhas} visoes={visoes} vinculos={vinculos} alvos={alvos} podeEditar={pode.configurar} />;
  } else if (aba === "comparativo") {
    conteudo = (
      <OrcamentoComparativo titulo={`${orcamento.nome} ${orcamento.ano}`} {...await dadosComparativo(id, acesso.u.id, repOrc)} podeExportar={pode.exportar} podePublicar={pode.configurar} />
    );
  } else if (aba === "vinculos") {
    const [itens, vinculos, alvos, visoes] = await Promise.all([getOrcamentoItens(id), listarVinculosOrcamento(), alvosVinculoOrcamento(), listarVisoesOrcamento()]);
    conteudo = (
      <OrcamentoVinculosAba
        visoes={visoes}
        itens={itens.map((i) => ({ orgao: i.orgao, unidade: i.unidade, acao: i.acao, valorInicial: i.valorInicial }))}
        vinculos={vinculos}
        alvos={alvos}
        podeEditar={pode.configurar}
      />
    );
  } else {
    const [{ itens, vinculos }, alvos, visoes, ed] = await Promise.all([
      doEscopo(),
      alvosVinculoOrcamento(),
      listarVisoesOrcamento(),
      carregarEdicoes(acesso.u.id, "orcamento-lancamentos:"),
    ]);
    conteudo = (
      <OrcamentoLancamentos
        orcamento={orcamento}
        pode={pode}
        itens={comVinculos(itens, vinculosDaVisao(vinculos, null), alvos)}
        visoes={visoes}
        edicoes={{ chave: CHAVE_LANCAMENTOS, lista: ed.lista, padroes: ed.padroes, podePublicar: pode.configurar }}
      />
    );
  }

  return (
    <OrcamentoEspacoView orcamento={orcamento} aba={aba} permitidas={permitidas} podeExcluir={pode.excluir}>
      <PermissaoExportar permitido={pode.exportar}>{conteudo}</PermissaoExportar>
    </OrcamentoEspacoView>
  );
}
