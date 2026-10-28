"use client";

import { useEffect, useState } from "react";
import { rotuloPeriodo } from "@/lib/empenhos-core";
import { textoDuracao, textoPct } from "@/lib/fluxo-progresso";
import { type EtapaImportacao, fracaoDoPedido, ORDEM_ETAPAS, ordenarPedidos, type PedidoAndamento, resumoPedidos, ROTULO_ETAPA, textoBytes, textoPedido } from "@/lib/importacao-progresso";
import { fracaoDaImportacao, type ImportacaoLocal } from "@/lib/importacoes-ao-vivo-store";
import type { LoteAoVivo } from "@/lib/importacoes-andamento";
import { fracaoDaLeitura as fracaoLeituraGrande } from "@/lib/empenhos-core";
import { useEstimativa } from "./fluxos/useEstimativa";
import { IconAlert, IconCirculo, IconCirculoCheck, IconSpinner } from "./icons";
import { Progress } from "./Progress";

/** O relógio da tela (os textos "há 12 s", a velocidade) — um tique por segundo só enquanto a importação roda. */
export function useAgora(ativo: boolean): number {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    if (!ativo) return;
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [ativo]);
  return agora;
}

/** "2 min 05 s" / "48 s". */
export function textoDecorrido(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, "0")} s`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}

const num = (n: number) => n.toLocaleString("pt-BR");

function IconeFase({ fase }: { fase: PedidoAndamento["fase"] }) {
  if (fase === "concluido" || fase === "dividido") return <IconCirculoCheck aria-hidden className="size-4 shrink-0 text-[var(--ok)]" />;
  if (fase === "erro") return <IconAlert aria-hidden className="size-4 shrink-0 text-[var(--danger)]" />;
  if (fase === "esperando") return <IconAlert aria-hidden className="size-4 shrink-0 text-[var(--warn)]" />;
  if (fase === "fila") return <IconCirculo aria-hidden className="size-4 shrink-0 text-faint" />;
  return <IconSpinner aria-hidden className="size-4 shrink-0 text-accent" />;
}

/**
 * O ANDAMENTO AO VIVO de uma importação desta aba (a mesma informação do painel do canto inferior direito, por extenso): a
 * barra geral com o % e o tempo que falta, as ETAPAS (preparar · ler o que já está gravado · ler a Centi · conferir e gravar)
 * e cada PEDIDO à Centi com a fase dele — aguardando a resposta, baixando (MB, velocidade), lendo, comparando, gravando
 * parte a parte, lido (registros, novos, alterados), dividido, nova tentativa ou erro.
 */
export function AndamentoImportacao({ imp, compacto = false }: { imp: ImportacaoLocal; compacto?: boolean }) {
  const rodando = imp.estado === "rodando";
  const agora = useAgora(rodando);
  const fracao = fracaoDaImportacao(imp, agora);
  const restante = useEstimativa(fracao, rodando);
  const r = resumoPedidos(imp.pedidos);
  const pedidos = ordenarPedidos(imp.pedidos);
  const etapaIdx = imp.etapa === "fim" ? ORDEM_ETAPAS.length : ORDEM_ETAPAS.indexOf(imp.etapa);

  const detalheEtapa = (e: EtapaImportacao): string | null => {
    if (e === "assinaturas" && imp.assinaturas != null) return `${num(imp.assinaturas)} registros já gravados no ano`;
    if (e === "leitura" && imp.pedidos.length)
      return `${num(r.concluidos)} de ${num(imp.pedidos.length)} pedidos lidos${r.emCurso ? ` · ${num(r.emCurso)} em curso` : ""}${r.fila ? ` · ${num(r.fila)} na fila` : ""} · ${textoBytes(r.bytes)} baixados · ${num(r.registros)} registros`;
    if (e === "conclusao" && imp.etapa === "conclusao")
      return imp.aguardandoConfirmacao ? "Aguardando a sua confirmação (os números caíram)" : `Conferindo o total da Centi e gravando só o que mudou — há ${textoDecorrido(agora - imp.etapaMs)}`;
    return null;
  };

  return (
    <div className="@container space-y-3" aria-live="polite">
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[13px]">
          <span className="font-medium text-text">
            {rodando ? ROTULO_ETAPA[imp.etapa] : (imp.texto ?? ROTULO_ETAPA.fim)}
            {rodando && imp.aguardandoConfirmacao && " — aguardando a confirmação"}
          </span>
          <span className="text-muted tabular-nums">
            {rodando ? textoPct(fracao) : textoPct(1, true)}
            {rodando && restante != null && ` · faltam ${textoDuracao(restante)}`}
            {` · ${rodando ? "há" : "em"} ${textoDecorrido((imp.fimMs ?? agora) - imp.inicioMs)}`}
          </span>
        </div>
        {rodando && <Progress value={fracao * 100} label={`${ROTULO_ETAPA[imp.etapa]}: ${textoPct(fracao)}`} continuo />}
      </div>

      {!compacto && (
        <ol aria-label="Etapas da importação" className="grid gap-1.5 @min-[22rem]:grid-cols-2 @min-[52rem]:grid-cols-4">
          {ORDEM_ETAPAS.map((e, i) => {
            const feita = i < etapaIdx || (imp.etapa === "fim" && imp.estado === "gravado");
            const atual = i === etapaIdx && rodando;
            const det = detalheEtapa(e);
            return (
              <li key={e} className={`flex items-start gap-2 rounded-control border px-2.5 py-2 text-[12.5px] ${atual ? "border-accent/40 bg-accent-soft" : "border-border"}`}>
                {feita ? <IconCirculoCheck aria-hidden className="mt-px size-4 shrink-0 text-[var(--ok)]" /> : atual ? <IconSpinner aria-hidden className="mt-px size-4 shrink-0 text-accent" /> : <IconCirculo aria-hidden className="mt-px size-4 shrink-0 text-faint" />}
                <span className="min-w-0">
                  <span className={`block font-medium ${atual ? "text-text" : feita ? "text-text-2" : "text-muted"}`}>{ROTULO_ETAPA[e]}</span>
                  {det && <span className="block text-muted tabular-nums">{det}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {pedidos.length > 0 && (
        <ul aria-label="Pedidos à Centi" className={`divide-y divide-border overflow-y-auto rounded-control border border-border ${compacto ? "max-h-40" : "max-h-72"}`}>
          {pedidos.map((p) => {
            const ativo = p.fase !== "fila" && p.fase !== "concluido" && p.fase !== "dividido" && p.fase !== "erro" && p.fase !== "esperando";
            return (
              <li key={p.chave} className="space-y-1 px-2.5 py-1.5 text-[12.5px]">
                <div className="flex items-center gap-2">
                  <IconeFase fase={p.fase} />
                  <span className="min-w-0 flex-1 truncate font-medium text-text tabular-nums">
                    {rotuloPeriodo(p.periodo)} · {p.rotuloPagina}
                  </span>
                  {ativo && <span className="shrink-0 text-muted tabular-nums">{textoPct(fracaoDoPedido(p))}</span>}
                </div>
                <p className={`pl-6 tabular-nums ${p.fase === "erro" ? "text-[var(--danger)]" : p.fase === "esperando" ? "text-[var(--warn)]" : "text-muted"}`} title={textoPedido(p, agora)}>
                  {textoPedido(p, agora)}
                </p>
                {ativo && (
                  <div className="ml-6 h-1 overflow-hidden rounded-full bg-track" aria-hidden>
                    <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${fracaoDoPedido(p) * 100}%` }} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const quando = (sql: string, agora: number) => {
  const t = Date.parse(sql.includes("T") ? sql : `${sql.replace(" ", "T")}Z`);
  return Number.isFinite(t) ? `há ${textoDecorrido(agora - t)}` : "";
};

/**
 * O ANDAMENTO de uma importação do SERVIDOR (a atualização automática, outra aba, outra pessoa) — o que o banco sabe: a
 * fração do ano lido (+ a resposta grande em fragmentos), os números do lote e os últimos pedidos à Centi.
 */
export function AndamentoDoServidor({ lote: l }: { lote: LoteAoVivo }) {
  const lendo = l.estado === "lendo";
  const agora = useAgora(lendo);
  const restante = useEstimativa(l.fracao, lendo);
  const pag = (p: number) => (l.orgaosCenti ? `órgão ${l.orgaosCenti[p - 1] ?? p}` : `página ${p}`);
  return (
    <div className="@container space-y-3 text-[12.5px]">
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <span className="font-medium text-text">{lendo ? (l.doCron ? "Atualização automática lendo a Centi" : `Importação manual de ${l.iniciadoPor}`) : (l.mensagem ?? "Terminou")}</span>
          <span className="text-muted tabular-nums">
            {lendo ? textoPct(l.fracao) : textoPct(1, true)}
            {lendo && restante != null && ` · faltam ${textoDuracao(restante)}`}
            {` · começou ${quando(l.iniciadoEm, agora)}`}
          </span>
        </div>
        {lendo && <Progress value={l.fracao * 100} label={`Ano lido: ${textoPct(l.fracao)}`} continuo />}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 tabular-nums @min-[30rem]:grid-cols-4">
        {[
          ["Pedidos", num(l.pedidos)],
          ["Com erro", num(l.erros)],
          ["Registros distintos", num(l.unicos)],
          ["Baixado", textoBytes(l.bytes)],
        ].map(([r, v]) => (
          <div key={r}>
            <dt className="text-muted">{r}</dt>
            <dd className="font-medium text-text">{v}</dd>
          </div>
        ))}
      </dl>
      {l.leitura && (
        <p className="rounded-control border border-border px-2.5 py-1.5 text-muted">
          <span className="font-medium text-text">
            {rotuloPeriodo(l.leitura)}:
          </span>{" "}
          {l.leitura.capturado
            ? `resposta grande capturada (${textoBytes(l.leitura.bytes)}), processando ${textoPct(fracaoLeituraGrande(l.leitura) * 2 - 1)}`
            : `baixando a resposta grande: ${textoBytes(l.leitura.bytes)}${l.leitura.comprimento ? ` de ${textoBytes(l.leitura.comprimento)}` : ""}`}
        </p>
      )}
      {l.passos.length > 0 && (
        <ul aria-label="Últimos pedidos à Centi" className="divide-y divide-border rounded-control border border-border">
          {l.passos.map((p) => {
            const guardando = (p.mensagem ?? "").startsWith("Guardando a página");
            const fase: PedidoAndamento["fase"] = guardando ? "gravando" : p.estado === "erro" ? "erro" : p.estado === "dividido" ? "dividido" : "concluido";
            return (
              <li key={p.id} className="space-y-0.5 px-2.5 py-1.5">
                <div className="flex items-center gap-2">
                  <IconeFase fase={fase} />
                  <span className="min-w-0 flex-1 truncate font-medium text-text tabular-nums">
                    {rotuloPeriodo(p)} · {pag(p.pagina)}
                  </span>
                  <span className="shrink-0 text-muted">{quando(p.em, agora)}</span>
                </div>
                <p className={`pl-6 tabular-nums ${fase === "erro" ? "text-[var(--danger)]" : "text-muted"}`}>
                  {guardando
                    ? "Gravando no banco…"
                    : fase === "erro"
                      ? (p.mensagem ?? "Falhou")
                      : fase === "dividido"
                        ? "Grande demais — dividido em períodos menores"
                        : `${num(p.recebidos)} registros · ${num(p.resNovos ?? 0)} novos, ${num(p.resAlterados ?? 0)} alterados, ${num(p.resIguais ?? 0)} iguais${p.bytes ? ` · ${textoBytes(p.bytes)}` : ""}${p.ms ? ` · ${textoDecorrido(p.ms)}` : ""}`}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
