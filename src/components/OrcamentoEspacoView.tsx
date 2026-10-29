"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { brlCompact, num } from "@/lib/format";
import type { OrcamentoResumo } from "@/lib/orcamento";
import { dotacaoAtualizada, pctEmpenhado } from "@/lib/orcamento-indicadores";
import { AbasEspaco } from "./AbasEspaco";
import { AvisoFlutuante } from "./AvisoFlutuante";
import { Button } from "./Button";
import { useConfirmacao } from "./Confirmacao";
import { IconTrash } from "./icons";
import { type CartaoKpi, IndicadoresKpi } from "./IndicadoresKpi";
import { useOndeDetalhe } from "./CanalGrupo";

export type AbaOrcamento = "lancamentos" | "comparativo" | "vinculos" | "visoes";

/**
 * TELA DO ORÇAMENTO (`/painel/orcamento/[id]`) — aberta pelo card. Enxuta, usando a largura toda: UMA linha de
 * cabeçalho (voltar · nome · ano · indicadores · excluir — só o ícone) e a barra das abas **Lançamentos · Comparativo · Vínculos ·
 * Visões** com as
 * ferramentas da aba à direita (`AbasEspaco` + `FerramentasAba`; o servidor monta SÓ a aba ativa).
 */
export function OrcamentoEspacoView({
  orcamento: o,
  aba,
  permitidas,
  podeExcluir,
  children,
}: {
  orcamento: OrcamentoResumo;
  aba: AbaOrcamento;
  /** As abas que o papel vê (Detalhes do papel → Componentes); ausente = todas. */
  permitidas?: readonly AbaOrcamento[];
  /** O papel exclui orçamentos (a lixeira do cabeçalho). */
  podeExcluir: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  useOndeDetalhe(o.nome);
  const [excluindo, setExcluindo] = useState(false);
  const [falha, setFalha] = useState(false);
  const { confirmar, confirmacao } = useConfirmacao();

  async function excluir() {
    const ok = await confirmar({
      titulo: `Excluir o orçamento "${o.nome}" (${o.ano})?`,
      texto: `Os ${num(o.totalItens)} lançamentos vão junto. Esta ação não pode ser desfeita.`,
      confirmar: "Excluir",
      perigo: true,
    });
    if (!ok) return;
    setExcluindo(true);
    setFalha(false);
    const r = await fetch(`/api/orcamento/${o.id}`, { method: "DELETE" }).catch(() => null);
    if (r?.ok) {
      router.push("/painel/orcamento");
      router.refresh();
      return;
    }
    setExcluindo(false);
    setFalha(true);
  }

  // Os números do orçamento em indicadores (dois detalhes cada), logo abaixo da linha das abas.
  const cartoes: CartaoKpi[] = [
    { label: "Dotação atualizada", value: brlCompact(dotacaoAtualizada(o)), cor: "var(--accent)", detalhes: [{ rotulo: "Inicial", valor: brlCompact(o.valorInicial) }, { rotulo: "Ano", valor: String(o.ano) }] },
    { label: "Empenhado", value: brlCompact(o.empenho), detalhes: [{ rotulo: "Da dotação", valor: `${Math.round(pctEmpenhado(o))}%` }, { rotulo: "Saldo", valor: brlCompact(o.saldo) }] },
    { label: "Saldo", value: brlCompact(o.saldo), cor: "var(--ok)", detalhes: [{ rotulo: "Da dotação", valor: `${Math.round(100 - pctEmpenhado(o))}%` }, { rotulo: "Empenhado", valor: brlCompact(o.empenho) }] },
    { label: "Lançamentos", value: num(o.totalItens), detalhes: [{ rotulo: "Orçamento", valor: o.nome }, { rotulo: "Ano", valor: String(o.ano) }] },
  ];

  return (
    <div className="space-y-[var(--gap-block)]">
      <AbasEspaco<AbaOrcamento>
        aba={aba}
        voltar={{ href: "/painel/orcamento", rotulo: "Orçamento" }}
        fim={
          podeExcluir ? (
            <Button
              size="sm"
              variant="icon"
              loading={excluindo}
              aria-label={`Excluir o orçamento ${o.nome}`}
              title="Excluir orçamento"
              icon={<IconTrash className="h-4 w-4" style={{ color: "var(--danger)" }} />}
              onClick={excluir}
            />
          ) : undefined
        }
        opcoes={([
          { value: "lancamentos", label: "Lançamentos" },
          { value: "comparativo", label: "Comparativo" },
          { value: "vinculos", label: "Vínculos" },
          { value: "visoes", label: "Visões" },
        ] as const).filter((o) => !permitidas || permitidas.includes(o.value))}
      >
        <IndicadoresKpi chave="orcamento:indicadores" cartoes={cartoes} />
        {children}
      </AbasEspaco>

      {confirmacao}
      {falha && (
        <AvisoFlutuante kind="danger" titulo="Atenção" onClose={() => setFalha(false)}>
          Não foi possível excluir o orçamento.
        </AvisoFlutuante>
      )}
    </div>
  );
}
