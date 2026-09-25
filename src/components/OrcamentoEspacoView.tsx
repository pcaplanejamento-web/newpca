"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { brlCompact, num } from "@/lib/format";
import type { OrcamentoResumo } from "@/lib/orcamento";
import { dotacaoAtualizada, pctEmpenhado } from "@/lib/orcamento-indicadores";
import { AbasEspaco } from "./AbasEspaco";
import { AvisoFlutuante } from "./AvisoFlutuante";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { useConfirmacao } from "./Confirmacao";
import { IconChevronLeft, IconTrash } from "./icons";

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
  podeEditar,
  children,
}: {
  orcamento: OrcamentoResumo;
  aba: AbaOrcamento;
  podeEditar: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
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

  const indicadores = [
    { rotulo: "Dotação atualizada", valor: brlCompact(dotacaoAtualizada(o)) },
    { rotulo: "Empenhado", valor: `${brlCompact(o.empenho)} · ${Math.round(pctEmpenhado(o))}%` },
    { rotulo: "Saldo", valor: brlCompact(o.saldo) },
    { rotulo: "Lançamentos", valor: num(o.totalItens) },
  ];

  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href="/painel/orcamento"
            aria-label="Voltar para Orçamento"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-control text-muted transition-colors hover:bg-surface-2 hover:text-text lg:h-[var(--h-control-sm)] lg:w-[var(--h-control-sm)]"
          >
            <IconChevronLeft className="h-4 w-4" />
          </Link>
          <h1 className="min-w-0 truncate text-lg font-bold text-text" title={o.nome}>
            {o.nome}
          </h1>
          <Badge tone="blue">{o.ano}</Badge>
        </div>
        <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          {indicadores.map((i) => (
            <div key={i.rotulo} className="flex items-baseline gap-1.5">
              <dt className="text-muted">{i.rotulo}</dt>
              <dd className="font-semibold tabular-nums text-text">{i.valor}</dd>
            </div>
          ))}
        </dl>
        {podeEditar && (
          <Button
            size="sm"
            variant="icon"
            className="ml-auto"
            loading={excluindo}
            aria-label={`Excluir o orçamento ${o.nome}`}
            title="Excluir orçamento"
            icon={<IconTrash className="h-4 w-4" style={{ color: "var(--danger)" }} />}
            onClick={excluir}
          />
        )}
      </div>

      <AbasEspaco<AbaOrcamento>
        aba={aba}
        opcoes={[
          { value: "lancamentos", label: "Lançamentos" },
          { value: "comparativo", label: "Comparativo" },
          { value: "vinculos", label: "Vínculos" },
          { value: "visoes", label: "Visões" },
        ]}
      >
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
