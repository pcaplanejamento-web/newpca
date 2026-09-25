import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { type AbaOrcamento, OrcamentoEspacoView } from "@/components/OrcamentoEspacoView";
import { OrcamentoLancamentos } from "@/components/OrcamentoLancamentos";
import { OrcamentoVinculosAba } from "@/components/OrcamentoVinculosAba";
import { OrcamentoVisoes } from "@/components/OrcamentoVisoes";
import { getUsuarioAtual } from "@/lib/auth";
import { alvosVinculoOrcamento, getOrcamento, getOrcamentoItens, listarVinculosOrcamento } from "@/lib/orcamento";
import { DIMENSOES_ORCAMENTO, type LinhaOrcamentoVisao } from "@/lib/orcamento-visao";

export const dynamic = "force-dynamic";

const ABAS: AbaOrcamento[] = ["lancamentos", "vinculos", "visoes"];

// TELA DO ORÇAMENTO (aberta pelo card): Lançamentos · Vínculos · Visões. O servidor monta SÓ a aba ativa
// (`?aba=`) e manda ao cliente só os campos que ela usa.
export default async function OrcamentoEspacoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const id = Number((await params).id);
  const sp = await searchParams;
  const orcamento = Number.isInteger(id) && id > 0 ? await getOrcamento(id) : null;
  if (!orcamento) notFound();
  const u = await getUsuarioAtual();
  const podeEditar = u?.role === "admin" || u?.role === "gestor";
  const aba: AbaOrcamento = ABAS.includes(sp.aba as AbaOrcamento) ? (sp.aba as AbaOrcamento) : "lancamentos";
  const itens = await getOrcamentoItens(id);

  let conteudo: ReactNode;
  if (aba === "visoes") {
    // Só as dimensões da visão + a dotação (a prévia do Σ).
    const linhas = itens.map((i) => {
      const l: LinhaOrcamentoVisao & { valorInicial: number } = { valorInicial: i.valorInicial };
      for (const d of DIMENSOES_ORCAMENTO) l[d.key] = i[d.key];
      return l;
    });
    conteudo = <OrcamentoVisoes itens={linhas} podeEditar={podeEditar} />;
  } else {
    const [vinculos, alvos] = await Promise.all([listarVinculosOrcamento(), alvosVinculoOrcamento()]);
    conteudo =
      aba === "vinculos" ? (
        <OrcamentoVinculosAba
          itens={itens.map((i) => ({ orgao: i.orgao, unidade: i.unidade, valorInicial: i.valorInicial }))}
          vinculos={vinculos}
          alvos={alvos}
          podeEditar={podeEditar}
        />
      ) : (
        <OrcamentoLancamentos titulo={`${orcamento.nome} · ${orcamento.ano}`} itens={itens} vinculos={vinculos} alvos={alvos} />
      );
  }

  return (
    <OrcamentoEspacoView orcamento={orcamento} aba={aba} podeEditar={podeEditar}>
      {conteudo}
    </OrcamentoEspacoView>
  );
}
