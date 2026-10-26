"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type CSSProperties, type ReactNode, useRef, useState } from "react";
import { useAlturaTela } from "./AlturaCheia";
import { cardPorOrgao, estadoCard, NOME_TIPO, pendenciasDoCard, type ResumoCard, rotaDoCard, rotuloAnos } from "@/lib/empenho-cards-core";
import { brl, dataHoraBR, num } from "@/lib/format";
import { AbasEspaco } from "./AbasEspaco";
import { Avisos } from "./Avisos";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { useOndeDetalhe } from "./CanalGrupo";
import { useConfirmacao } from "./Confirmacao";
import { IconCheck, IconChevronLeft, IconTrash } from "./icons";
import { toast } from "./Toast";

export type AbaCard = "empenhos" | "liquidacoes" | "pagamentos" | "vinculos" | "importacao" | "configuracao";

/**
 * O ESPAÇO de um CARD de empenhos (`/painel/empenhos/[id]`), de liquidações (`/painel/liquidacoes/[id]` — a aba Liquidações
 * no lugar de Empenhos) ou de pagamentos (`/painel/pagamentos/[id]` — a aba Pagamentos) — no padrão da tela do orçamento: UMA linha de cabeçalho
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
  const liq = cardPorOrgao(c.tipo);
  const nome = NOME_TIPO[c.tipo];
  // A volta leva às IMPORTAÇÕES (a lista de cards) — a tela do módulo abre nos Dados.
  const lista = `/painel/${c.tipo}?aba=importacoes`;
  const e = estadoCard(c, c.lendo);
  const pendencias = pendenciasDoCard(c, c.vinculos);
  // A ORDEM obrigatória: Configuração → Vínculos → Importação (no de liquidações, só a Configuração: os órgãos são os do
  // cadastro com o "ID na Centi").
  const etapas = [
    { aba: "configuracao" as const, rotulo: "1. Configuração", feito: !!c.configuradoEm },
    ...(liq ? [] : [{ aba: "vinculos" as const, rotulo: "2. Vínculos", feito: c.vinculos > 0 }]),
  ];

  async function excluir() {
    const ok = await confirmar({
      titulo: `Excluir o card "${c.nome}"?`,
      texto: liq
        ? `${nome.masc ? "Os" : "As"} ${num(c.empenhos)} ${nome.varios} ${nome.masc ? "gravados" : "gravadas"} e o histórico das importações vão junto. Esta ação não pode ser desfeita.`
        : `Os ${num(c.empenhos)} empenhos gravados, os ${num(c.vinculos)} vínculos e o histórico das importações vão junto. Esta ação não pode ser desfeita.`,
      confirmar: "Excluir",
      perigo: true,
    });
    if (!ok) return;
    setExcluindo(true);
    const r = await fetch(`/api/empenhos/cards/${c.id}`, { method: "DELETE" }).catch(() => null);
    if (r?.ok) {
      toast.success(`Card "${c.nome}" excluído.`);
      router.push(lista);
      router.refresh();
      return;
    }
    setExcluindo(false);
    toast.error("Não foi possível excluir o card.");
  }

  const indicadores = [
    { rotulo: nome.titulo, valor: num(c.empenhos) },
    c.tipo === "pagamentos" ? { rotulo: "Pago líquido", valor: brl(c.liquidado) } : { rotulo: liq ? "Liquidado" : "Empenhado", valor: brl(c.soma) },
    { rotulo: "Anos", valor: rotuloAnos(c.anos) },
    { rotulo: "Última leitura", valor: c.ultimaExecucao ? dataHoraBR(c.ultimaExecucao) : "—" },
  ];
  const opcoes = (
    [
      { value: "empenhos", label: "Empenhos" },
      { value: "liquidacoes", label: "Liquidações" },
      { value: "pagamentos", label: "Pagamentos" },
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
            href={lista}
            aria-label={`Voltar para ${nome.titulo}`}
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
        {/* Os AVISOS do card no (!) — nada de faixa que empurra as abas. */}
        <div className="ml-auto flex items-center gap-1.5">
          <Avisos
            titulo="Avisos do card"
            avisos={
              pendencias.length
                ? [
                    {
                      id: "configurar",
                      tom: "warn",
                      texto: (
                        <>
                          <p className="font-semibold text-text">Configure o card antes de importar</p>
                          <p>{pendencias.map((p) => p.texto).join(" ")} A importação (e a atualização automática) só é liberada depois.</p>
                          <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                            {etapas.map((et) => (
                              <Link key={et.aba} href={rotaDoCard(c, et.aba)} className={`inline-flex min-h-11 items-center gap-1.5 font-semibold lg:min-h-0 ${et.feito ? "text-[color:var(--ok)]" : "text-text underline underline-offset-2"}`}>
                                {et.feito && <IconCheck className="h-4 w-4" />}
                                {et.rotulo}
                              </Link>
                            ))}
                            <span className="text-muted">3. Importação</span>
                          </p>
                        </>
                      ),
                    },
                  ]
                : []
            }
          />
        {podeExcluir && (
          <Button
            size="sm"
            variant="icon"
            loading={excluindo}
            aria-label={`Excluir o card ${c.nome}`}
            title="Excluir card"
            icon={<IconTrash className="h-4 w-4" style={{ color: "var(--danger)" }} />}
            onClick={excluir}
          />
        )}
        </div>
      </div>


      <AbasEspaco<AbaCard> aba={aba} opcoes={opcoes}>
        <AteOFim>{children}</AteOFim>
      </AbasEspaco>

      {confirmacao}
    </div>
  );
}

/**
 * No desktop, o conteúdo da aba vai no máximo até o fim do display e rola por dentro — a página nunca rola (a barra das
 * abas e o cabeçalho ficam à vista). As tabelas `scrollInterno` já medem até o fim e cabem sem rolar aqui.
 */
export function AteOFim({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const altura = useAlturaTela(ref, 240);
  return (
    <div ref={ref} className="space-y-[var(--gap-block)] lg:max-h-[var(--h-aba)] lg:overflow-y-auto" style={altura ? ({ "--h-aba": `${altura}px` } as CSSProperties) : undefined}>
      {children}
    </div>
  );
}
