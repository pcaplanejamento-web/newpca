"use client";

import { useMemo } from "react";
import type { RegrasAvaliacao } from "@/lib/avaliacao-core";
import { ESTADO_PROTOCOLO_ROTULO, estadoProtocoloCor } from "@/lib/dfd-tratamento";
import { brl, brlCompact, num, pct } from "@/lib/format";
import {
  DIAS_ALERTA,
  type DfdPainel,
  ESTADOS_PAINEL,
  type EstadoPainel,
  painelMesa,
  type ProtocoloPainel,
  SEMANAS_PAINEL,
} from "@/lib/mesa-dashboard";
import type { FiltroMesa } from "@/lib/mesa-filtros";
import { nomeExibicao, type Pessoa } from "@/lib/pessoa";
import type { SituacaoCadastrada } from "@/lib/situacoes";
import { Avatar } from "./Avatar";
import { ChartCard } from "./ChartCard";
import { BarraSegmentada, BarrasH, Colunas, type LinhaBarra } from "./charts/Barras";
import { ChartEmpty } from "./charts/shared";
import { IconUser } from "./icons";
import { KpiStat } from "./KpiStat";

const ROTULO_ESTADO: Record<EstadoPainel, string> = {
  regular: ESTADO_PROTOCOLO_ROTULO.regular,
  atencao: ESTADO_PROTOCOLO_ROTULO.atencao,
  erro: ESTADO_PROTOCOLO_ROTULO.erro,
  conferindo: "Conferindo…",
  naoConferido: "Não conferido",
};
/** Rampa ORDINAL do tempo na Mesa: o accent do ADM, do mais claro (recente) ao cheio (mais antigo). */
const RAMPA_IDADE = [45, 56, 67, 78, 89, 100].map((p) => `color-mix(in srgb, var(--accent) ${p}%, var(--surface))`);
const plural = (n: number, um: string, varios: string) => `${num(n)} ${n === 1 ? um : varios}`;

/**
 * DASHBOARD DE GOVERNANÇA da Mesa (o ícone à esquerda de Protocolos · DFDs · Itens): KPIs + seis quadros sobre
 * os MESMOS dados da Mesa, já filtrados pelo Responsável/Assunto do topo — saúde (o estado agregado da conferência,
 * nas cores do ADM), situação (as do ADM, com as cores dele), tempo na Mesa, entrada semanal, carga por
 * responsável (tocar numa pessoa filtra a Mesa) e valor por unidade. Agregação PURA em `painelMesa`; gráficos em
 * HTML por token (`charts/Barras`) — nada de consulta nova ao banco.
 */
export function DashboardMesa({
  protocolos,
  dfds,
  situacoes,
  pessoas,
  regras,
  responsavel,
  onResponsavel,
}: {
  protocolos: ProtocoloPainel[];
  dfds: DfdPainel[];
  /** As situações cadastradas pelo ADM (ordem + nome + cor). */
  situacoes: SituacaoCadastrada[];
  /** Foto + apelido de quem é responsável por algum protocolo em escopo. */
  pessoas: ReadonlyMap<number, Pessoa>;
  regras: RegrasAvaliacao;
  /** O filtro de Responsável do topo (a linha dele fica marcada). */
  responsavel: FiltroMesa["responsavel"];
  onResponsavel: (v: FiltroMesa["responsavel"]) => void;
}) {
  const p = useMemo(() => painelMesa({ protocolos, dfds, situacoes: situacoes.map((s) => s.id) }, new Date()), [protocolos, dfds, situacoes]);
  const cores = useMemo<Record<EstadoPainel, string>>(
    () => ({
      regular: estadoProtocoloCor("regular", regras),
      atencao: estadoProtocoloCor("atencao", regras),
      erro: estadoProtocoloCor("erro", regras),
      conferindo: "var(--border-2)",
      naoConferido: "var(--faint)",
    }),
    [regras],
  );
  const situacaoPorId = useMemo(() => new Map(situacoes.map((s) => [s.id, s])), [situacoes]);

  const total = p.protocolos;
  const pendentes = p.saude.conferindo.n + p.saude.naoConferido.n;
  const conferidos = total - pendentes;
  const segmentosDe = (n: (e: EstadoPainel) => number) =>
    ESTADOS_PAINEL.map((e) => ({ chave: e, valor: n(e), cor: cores[e], rotulo: ROTULO_ESTADO[e] }));
  const corSaude = p.saude.erro.n > 0 ? cores.erro : p.saude.atencao.n > 0 ? cores.atencao : cores.regular;
  const ultimas = p.semanas.slice(-7).map((s) => s.n);
  const picoSemana = Math.max(0, ...ultimas);
  const vazio = total === 0;

  // ---- Linhas dos quadros de barras ----
  const linhasSituacao: LinhaBarra[] = p.situacoes.map((s) => {
    const cad = s.id != null ? situacaoPorId.get(s.id) : undefined;
    const nome = cad?.nome ?? "Sem situação";
    return {
      chave: s.id ?? "sem",
      rotulo: nome,
      titulo: `${nome}: ${plural(s.n, "protocolo", "protocolos")} · ${brl(s.valor)}`,
      segmentos: [{ chave: "n", valor: s.n, cor: cad?.cor ?? "var(--faint)", rotulo: nome }],
      valor: num(s.n),
      detalhe: brlCompact(s.valor),
      apagada: s.id == null,
    };
  });
  const linhasResp: LinhaBarra[] = p.responsaveis.map((r) => {
    const pessoa = r.id != null ? pessoas.get(r.id) : undefined;
    const nome = r.id == null ? "Sem responsável" : pessoa ? nomeExibicao(pessoa) : `Pessoa #${r.id}`;
    return {
      chave: r.id ?? "sem",
      rotulo: (
        <span className="inline-flex min-w-0 max-w-full items-center gap-2 align-middle">
          {r.id == null ? (
            <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-surface-2 text-faint">
              <IconUser className="h-3.5 w-3.5" />
            </span>
          ) : (
            <Avatar nome={pessoa?.nome ?? nome} foto={pessoa?.foto} size="xs" />
          )}
          <span className="truncate">{nome}</span>
        </span>
      ),
      titulo: `${pessoa && pessoa.nome !== nome ? `${nome} — ${pessoa.nome}` : nome}: ${plural(r.n, "protocolo", "protocolos")} · ${brl(r.valor)}`,
      segmentos: segmentosDe((e) => r.porEstado[e]),
      valor: num(r.n),
      detalhe: brlCompact(r.valor),
    };
  });
  if (p.outrosResponsaveis) {
    const o = p.outrosResponsaveis;
    linhasResp.splice(linhasResp.length - (p.responsaveis.at(-1)?.id == null ? 1 : 0), 0, {
      chave: "outros",
      rotulo: `Outras ${num(o.pessoas)} pessoas`,
      titulo: `Outras ${num(o.pessoas)} pessoas: ${plural(o.n, "protocolo", "protocolos")} · ${brl(o.valor)}`,
      segmentos: segmentosDe((e) => o.porEstado[e]),
      valor: num(o.n),
      detalhe: brlCompact(o.valor),
      apagada: true,
    });
  }
  const linhasUnidade: LinhaBarra[] = p.unidades.map((u) => ({
    chave: u.sigla || "sem",
    rotulo: u.sigla ? <span className="font-mono text-[12px] font-semibold">{u.sigla}</span> : "Sem unidade",
    titulo: `${u.nome ?? (u.sigla || "Sem unidade")}: ${brl(u.valor)} · ${plural(u.dfds, "DFD", "DFDs")}`,
    segmentos: [{ chave: "v", valor: u.valor, cor: "var(--accent)", rotulo: "Valor" }],
    valor: brlCompact(u.valor),
    detalhe: pct(u.valor, p.valor),
    apagada: !u.sigla,
  }));
  if (p.outrasUnidades) {
    const o = p.outrasUnidades;
    linhasUnidade.push({
      chave: "outras",
      rotulo: `Outras ${num(o.unidades)} unidades`,
      titulo: `Outras ${num(o.unidades)} unidades: ${brl(o.valor)} · ${plural(o.dfds, "DFD", "DFDs")}`,
      segmentos: [{ chave: "v", valor: o.valor, cor: "var(--accent)", rotulo: "Valor" }],
      valor: brlCompact(o.valor),
      detalhe: pct(o.valor, p.valor),
      apagada: true,
    });
  }
  const ativaResp = responsavel === "todos" ? null : responsavel;
  // Legenda dos estados presentes (identidade nunca só pela cor).
  const legenda = ESTADOS_PAINEL.filter((e) => p.saude[e].n > 0);

  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="grid grid-cols-2 gap-[var(--gap-block)] lg:grid-cols-5">
        <div className="col-span-2 lg:col-span-1">
          <KpiStat
            label="Protocolos na Mesa"
            value={num(total)}
            hint={`${plural(p.dfds, "DFD", "DFDs")} · ${plural(p.itens, "item", "itens")}`}
            spark={picoSemana > 0 ? ultimas.map((n) => (n / picoSemana) * 100) : undefined}
          />
        </div>
        <KpiStat label="Valor na Mesa" value={brlCompact(p.valor)} cor="var(--sit-finalizado)" hint="somatória dos DFDs" />
        <KpiStat
          label="Conformidade"
          value={conferidos > 0 ? pct(p.saude.regular.n, conferidos) : "—"}
          cor={corSaude}
          hint={
            pendentes > 0
              ? `conferindo ${num(conferidos)} de ${num(total)}…`
              : `${num(p.saude.erro.n)} com erro · ${num(p.saude.atencao.n)} em atenção`
          }
        />
        <KpiStat
          label="Com responsável"
          value={total > 0 ? pct(total - p.semResponsavel, total) : "—"}
          cor={p.semResponsavel > 0 ? "var(--warn)" : "var(--ok)"}
          hint={p.semResponsavel > 0 ? `${num(p.semResponsavel)} sem responsável` : "todos com responsável"}
        />
        <KpiStat
          label="Tempo médio na Mesa"
          value={p.diasMedio == null ? "—" : plural(Math.round(p.diasMedio), "dia", "dias")}
          cor="var(--sit-devolvido)"
          hint={p.acimaAlerta > 0 ? `${num(p.acimaAlerta)} há mais de ${DIAS_ALERTA} dias` : `nenhum há mais de ${DIAS_ALERTA} dias`}
        />
      </div>

      <div className="grid grid-cols-1 gap-[var(--gap-block)] md:grid-cols-2 xl:grid-cols-3">
        <ChartCard
          title="Saúde dos protocolos"
          subtitle={pendentes > 0 ? `Conferindo ${num(conferidos)} de ${num(total)}…` : "Estado agregado (capa, DFDs e itens) pelas regras do ADM"}
        >
          {vazio ? (
            <ChartEmpty label="Nenhum protocolo na Mesa" />
          ) : (
            <div className="space-y-3">
              <div className="flex items-baseline gap-2">
                <span className="text-[2rem] font-bold leading-none tracking-[-0.03em] text-text">
                  {conferidos > 0 ? pct(p.saude.regular.n, conferidos) : "—"}
                </span>
                <span className="text-[12.5px] text-muted">
                  regulares{pendentes > 0 ? ` · de ${plural(conferidos, "conferido", "conferidos")}` : ""}
                </span>
              </div>
              <BarraSegmentada trilho altura={12} segmentos={segmentosDe((e) => p.saude[e].n)} />
              <ul aria-label="Protocolos por estado" className="space-y-1">
                {ESTADOS_PAINEL.filter((e) => (e !== "conferindo" && e !== "naoConferido") || p.saude[e].n > 0).map((e) => (
                  <li key={e} className="grid grid-cols-[minmax(0,1fr)_auto_3.5rem_4.5rem] items-center gap-x-3 text-[12.5px]">
                    <span className="inline-flex min-w-0 items-center gap-2 text-text-2">
                      <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: cores[e] }} />
                      <span className="truncate">{ROTULO_ESTADO[e]}</span>
                    </span>
                    <span className="text-right font-semibold text-text tabular-nums">{num(p.saude[e].n)}</span>
                    <span className="text-right text-muted tabular-nums">{pct(p.saude[e].n, total)}</span>
                    <span className="text-right text-muted tabular-nums">{brlCompact(p.saude[e].valor)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Situação" subtitle="As situações cadastradas pelo ADM, na ordem dele">
          {vazio ? (
            <ChartEmpty label="Nenhum protocolo na Mesa" />
          ) : linhasSituacao.length === 0 ? (
            <ChartEmpty label="Nenhuma situação cadastrada (Configurações → Situações)" />
          ) : (
            <BarrasH ariaLabel="Protocolos por situação" linhas={linhasSituacao} />
          )}
        </ChartCard>

        <ChartCard
          title="Tempo na Mesa"
          subtitle={p.diasMaximo != null ? `Dias desde a protocolação · o mais antigo tem ${plural(p.diasMaximo, "dia", "dias")}` : "Dias desde a protocolação"}
        >
          {vazio ? (
            <ChartEmpty label="Nenhum protocolo na Mesa" />
          ) : (
            <Colunas
              ariaLabel="Protocolos por tempo na Mesa"
              rotularTodas
              colunas={p.faixasIdade.map((f, i) => ({
                chave: f.curto,
                rotulo: f.curto,
                valor: f.n,
                cor: RAMPA_IDADE[i],
                dica: { valor: `${plural(f.n, "protocolo", "protocolos")} · ${brlCompact(f.valor)}`, rotulo: f.rotulo },
              }))}
            />
          )}
        </ChartCard>

        <ChartCard
          title="Entrada de protocolos"
          subtitle={`Protocolações por semana — últimas ${SEMANAS_PAINEL} semanas`}
          action={<span className="whitespace-nowrap text-[12px] font-semibold text-text-2 tabular-nums">{num(p.semanas.reduce((t, s) => t + s.n, 0))} no período</span>}
        >
          <Colunas
            ariaLabel="Protocolações por semana"
            colunas={p.semanas.map((s) => ({
              chave: s.inicio,
              rotulo: s.rotulo,
              valor: s.n,
              dica: { valor: `${plural(s.n, "protocolo", "protocolos")} · ${brlCompact(s.valor)}`, rotulo: `Semana de ${s.rotulo}${s.atual ? " (atual)" : ""}` },
            }))}
          />
        </ChartCard>

        <ChartCard title="Carga por responsável" subtitle="Protocolos por pessoa e estado — toque numa pessoa para filtrar a Mesa">
          {vazio ? (
            <ChartEmpty label="Nenhum protocolo na Mesa" />
          ) : (
            <>
              <ul aria-label="Legenda dos estados" className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-muted">
                {legenda.map((e) => (
                  <li key={e} className="inline-flex items-center gap-1.5">
                    <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: cores[e] }} />
                    {ROTULO_ESTADO[e]}
                  </li>
                ))}
              </ul>
              <BarrasH
                ariaLabel="Protocolos por responsável"
                linhas={linhasResp}
                ativa={ativaResp}
                onEscolher={(k) => onResponsavel(k === ativaResp ? "todos" : k === "sem" ? "sem" : Number(k))}
              />
            </>
          )}
        </ChartCard>

        <ChartCard title="Valor por unidade" subtitle="Somatória dos DFDs por unidade requisitante (participação no total)">
          {p.dfds === 0 ? <ChartEmpty label="Nenhum DFD na Mesa" /> : <BarrasH ariaLabel="Valor dos DFDs por unidade" linhas={linhasUnidade} />}
        </ChartCard>
      </div>
    </div>
  );
}
