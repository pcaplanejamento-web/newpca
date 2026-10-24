"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { estadoCard, type ResumoCard, rotuloAnos } from "@/lib/empenho-cards-core";
import { brlCompact, dataHoraBR, num } from "@/lib/format";
import { AbasEspaco } from "./AbasEspaco";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { useOndeDetalhe } from "./CanalGrupo";
import { useConfirmacao } from "./Confirmacao";
import { IconChevronLeft, IconTrash } from "./icons";
import { toast } from "./Toast";

export type AbaCard = "empenhos" | "vinculos" | "importacao" | "configuracao";

/**
 * O ESPAÇO de um CARD de empenhos (`/painel/empenhos/[id]`) — no padrão da tela do orçamento: UMA linha de cabeçalho
 * (voltar · nome · estado · indicadores · excluir — só o ícone) e a barra das abas **Empenhos · Vínculos · Importação ·
 * Configuração** com as ferramentas da aba à direita (`AbasEspaco` + `FerramentasAba`; o servidor monta SÓ a aba ativa).
 */
export function EmpenhoCardView({
  card: c,
  aba,
  permitidas,
  podeExcluir,
  children,
}: {
  card: ResumoCard;
  aba: AbaCard;
  /** As abas que o papel abre (Importação = Importar; Configuração = Configurar). */
  permitidas: readonly AbaCard[];
  podeExcluir: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  useOndeDetalhe(c.nome);
  const [excluindo, setExcluindo] = useState(false);
  const { confirmar, confirmacao } = useConfirmacao();
  const e = estadoCard(c, c.lendo);

  async function excluir() {
    const ok = await confirmar({
      titulo: `Excluir o card "${c.nome}"?`,
      texto: `Os ${num(c.empenhos)} empenhos gravados, os ${num(c.vinculos)} vínculos e o histórico das importações vão junto. Esta ação não pode ser desfeita.`,
      confirmar: "Excluir",
      perigo: true,
    });
    if (!ok) return;
    setExcluindo(true);
    const r = await fetch(`/api/empenhos/cards/${c.id}`, { method: "DELETE" }).catch(() => null);
    if (r?.ok) {
      toast.success(`Card "${c.nome}" excluído.`);
      router.push("/painel/empenhos");
      router.refresh();
      return;
    }
    setExcluindo(false);
    toast.error("Não foi possível excluir o card.");
  }

  const indicadores = [
    { rotulo: "Empenhos", valor: num(c.empenhos) },
    { rotulo: "Empenhado", valor: brlCompact(c.soma) },
    { rotulo: "Anos", valor: rotuloAnos(c.anos) },
    { rotulo: "Última leitura", valor: c.ultimaExecucao ? dataHoraBR(c.ultimaExecucao) : "—" },
  ];
  const opcoes = (
    [
      { value: "empenhos", label: "Empenhos" },
      { value: "vinculos", label: "Vínculos" },
      { value: "importacao", label: "Importação", curto: "Importar" },
      { value: "configuracao", label: "Configuração", curto: "Config." },
    ] as const
  ).filter((o) => permitidas.includes(o.value));

  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="linha-topico flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href="/painel/empenhos"
            aria-label="Voltar para Empenhos"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-control text-muted transition-colors hover:bg-surface-2 hover:text-text lg:h-[var(--h-control-sm)] lg:w-[var(--h-control-sm)]"
          >
            <IconChevronLeft className="h-4 w-4" />
          </Link>
          <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ background: c.cor }} />
          <h1 className="min-w-0 truncate text-[26px] font-bold leading-[44px] tracking-tight text-text lg:text-2xl lg:leading-[var(--h-control-sm)]" title={c.nome}>
            {c.nome}
          </h1>
          <Badge tone={e.tom} dot vivo={c.lendo} tamanho="linha" className="shrink-0">
            {e.rotulo}
          </Badge>
        </div>
        <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          {indicadores.map((i) => (
            <div key={i.rotulo} className="flex items-baseline gap-1.5">
              <dt className="text-muted">{i.rotulo}</dt>
              <dd className="font-semibold tabular-nums text-text">{i.valor}</dd>
            </div>
          ))}
        </dl>
        {podeExcluir && (
          <Button
            size="sm"
            variant="icon"
            className="ml-auto"
            loading={excluindo}
            aria-label={`Excluir o card ${c.nome}`}
            title="Excluir card"
            icon={<IconTrash className="h-4 w-4" style={{ color: "var(--danger)" }} />}
            onClick={excluir}
          />
        )}
      </div>

      <AbasEspaco<AbaCard> aba={aba} opcoes={opcoes}>
        {children}
      </AbasEspaco>

      {confirmacao}
    </div>
  );
}
