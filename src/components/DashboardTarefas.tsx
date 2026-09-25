"use client";

import { useMemo, useState } from "react";
import { dataBR, num, pct } from "@/lib/format";
import { nomeExibicao, type Pessoa } from "@/lib/pessoa";
import {
  COR_FAIXA,
  COR_PRIORIDADE,
  excedeWip,
  FAIXAS_PRAZO,
  type FaixaPrazo,
  type ListaTarefas,
  painelTarefas,
  ROTULO_FAIXA,
  ROTULO_PRIORIDADE,
  type RecorteTarefas,
  rotuloTicket,
  SEMANAS_TAREFAS,
  type TarefaResumo,
  tarefasDoRecorte,
} from "@/lib/tarefas-core";
import { Avatar } from "./Avatar";
import { ChartCard } from "./ChartCard";
import { BarraSegmentada, BarrasH, Colunas, type LinhaBarra } from "./charts/Barras";
import { ChartEmpty } from "./charts/shared";
import { type Column, DataTable } from "./DataTable";
import { IconUser } from "./icons";
import { KpiStat } from "./KpiStat";
import { OrigemDados } from "./OrigemDados";

const plural = (n: number, um: string, varios: string) => `${num(n)} ${n === 1 ? um : varios}`;
/** Pessoas à vista na carga (o resto vira "Outras N pessoas"). */
const TOP_PESSOAS = 8;

/**
 * DASHBOARD DO QUADRO de tarefas (aba Dashboard): 5 KPIs (abertas, atrasadas, vencem em breve, concluídas no mês com o % no
 * prazo, tempo médio até concluir) + 6 quadros — saúde dos prazos, carga por pessoa (tocar filtra o quadro pela pessoa),
 * cartões por lista (com o WIP), abertas por prioridade e criadas/concluídas por semana. Sobre as tarefas JÁ FILTRADAS da
 * barra (nenhuma consulta nova); tocar num recorte abre a ORIGEM dos dados (a soma = o número) e a linha, a tarefa.
 */
export function DashboardTarefas({
  tarefas,
  listas,
  pessoas,
  hoje,
  responsavel,
  onResponsavel,
  onAbrir,
}: {
  tarefas: TarefaResumo[];
  listas: ListaTarefas[];
  pessoas: Pessoa[];
  hoje: string;
  /** O filtro de Responsável da barra (a pessoa marcada na carga). */
  responsavel: "todos" | "eu" | "sem" | number;
  onResponsavel: (r: "todos" | "sem" | number) => void;
  onAbrir: (id: number) => void;
}) {
  const p = useMemo(() => painelTarefas(tarefas, listas, hoje), [tarefas, listas, hoje]);
  const [origem, setOrigem] = useState<{ quadro: string; rotulo: string; recorte: RecorteTarefas } | null>(null);
  const porPessoa = useMemo(() => new Map(pessoas.map((x) => [x.id, x])), [pessoas]);
  const porLista = useMemo(() => new Map(listas.map((l) => [l.id, l.nome])), [listas]);
  const lista = useMemo(() => (origem ? tarefasDoRecorte(tarefas, origem.recorte, hoje) : []), [origem, tarefas, hoje]);
  const abrir = (quadro: string, rotulo: string, recorte: RecorteTarefas) => setOrigem({ quadro, rotulo, recorte });

  const vazio = p.abertas === 0;
  const semanaAtual = p.semanas.at(-1);
  const pico = Math.max(...p.semanas.map((s) => s.criadas), 0);
  const segmentosFaixa = (f: Record<FaixaPrazo, number>) => FAIXAS_PRAZO.map((k) => ({ chave: k, valor: f[k], cor: COR_FAIXA[k], rotulo: ROTULO_FAIXA[k] }));

  const nomePessoa = (id: number | null) => (id == null ? "Sem responsável" : porPessoa.get(id) ? nomeExibicao(porPessoa.get(id)) : `Pessoa #${id}`);
  const visiveis = p.carga.filter((c) => c.id != null).slice(0, TOP_PESSOAS);
  const outras = p.carga.filter((c) => c.id != null).slice(TOP_PESSOAS);
  const sem = p.carga.find((c) => c.id == null);
  const linhasCarga: LinhaBarra[] = [...visiveis, ...(sem ? [sem] : [])].map((c) => {
    const pessoa = c.id != null ? porPessoa.get(c.id) : undefined;
    return {
      chave: c.id ?? "sem",
      rotulo: (
        <span className="inline-flex min-w-0 max-w-full items-center gap-2 align-middle">
          {c.id == null ? (
            <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-surface-2 text-faint">
              <IconUser className="h-3.5 w-3.5" />
            </span>
          ) : (
            <Avatar nome={pessoa?.nome ?? nomePessoa(c.id)} foto={pessoa?.foto} size="xs" />
          )}
          <span className="truncate">{nomePessoa(c.id)}</span>
        </span>
      ),
      titulo: `${nomePessoa(c.id)}: ${plural(c.total, "tarefa aberta", "tarefas abertas")} · ${num(c.faixas.atrasada)} atrasada(s)`,
      segmentos: segmentosFaixa(c.faixas),
      valor: num(c.total),
      detalhe: c.faixas.atrasada ? `${num(c.faixas.atrasada)} atras.` : undefined,
    };
  });
  if (outras.length) {
    const soma = outras.reduce(
      (t, c) => ({ total: t.total + c.total, faixas: { atrasada: t.faixas.atrasada + c.faixas.atrasada, vence: t.faixas.vence + c.faixas.vence, ok: t.faixas.ok + c.faixas.ok } }),
      { total: 0, faixas: { atrasada: 0, vence: 0, ok: 0 } },
    );
    const quem = plural(outras.length, "outra pessoa", "outras pessoas");
    linhasCarga.splice(visiveis.length, 0, { chave: "outras", rotulo: quem, titulo: `${quem}: ${plural(soma.total, "tarefa", "tarefas")}`, segmentos: segmentosFaixa(soma.faixas), valor: num(soma.total), apagada: true });
  }
  const ativaResp = typeof responsavel === "number" ? responsavel : responsavel === "sem" ? "sem" : null;

  const linhasLista: LinhaBarra[] = p.porLista.map((l) => {
    const acima = excedeWip(l.n, l.limiteWip);
    return {
      chave: l.id,
      rotulo: <span className="truncate">{l.nome}</span>,
      titulo: `${l.nome}: ${plural(l.n, "tarefa", "tarefas")}${l.limiteWip ? ` · limite ${l.limiteWip}` : ""}`,
      segmentos: [{ chave: "n", valor: l.n, cor: acima ? "var(--warn)" : l.concluida ? "var(--ok)" : "var(--accent)", rotulo: "Tarefas" }],
      valor: num(l.n),
      detalhe: l.limiteWip ? <span style={acima ? { color: "var(--warn)" } : undefined}>/ {l.limiteWip}</span> : undefined,
    };
  });
  const linhasPrio: LinhaBarra[] = p.porPrioridade.map((x) => ({
    chave: x.prioridade,
    rotulo: ROTULO_PRIORIDADE[x.prioridade],
    titulo: `${ROTULO_PRIORIDADE[x.prioridade]}: ${plural(x.n, "tarefa aberta", "tarefas abertas")}`,
    segmentos: [{ chave: "n", valor: x.n, cor: COR_PRIORIDADE[x.prioridade], rotulo: "Abertas" }],
    valor: num(x.n),
    detalhe: pct(x.n, p.abertas),
  }));

  const colunas = useMemo<Column<TarefaResumo>[]>(() => {
    const nome = (id: number) => (porPessoa.get(id) ? nomeExibicao(porPessoa.get(id)) : `Pessoa #${id}`);
    return [
      { key: "ticket", header: "Ticket", nowrap: true, filter: "none", value: (t) => String(t.ticket).padStart(9, "0"), render: (t) => <span className="font-mono text-[12px] text-text-2">{rotuloTicket(t.ticket)}</span> },
      { key: "titulo", header: "Título", align: "left", minWidth: 220, value: (t) => t.titulo, render: (t) => <span className="line-clamp-1 font-medium text-text">{t.titulo}</span> },
      { key: "lista", header: "Lista", nowrap: true, value: (t) => porLista.get(t.listaId) ?? "—", render: (t) => porLista.get(t.listaId) ?? "—" },
      { key: "prazo", header: "Prazo", nowrap: true, filter: "date", value: (t) => t.prazo ?? "", render: (t) => dataBR(t.prazo) },
      {
        key: "resp",
        header: "Responsáveis",
        nowrap: true,
        value: (t) => (t.pessoas.length ? t.pessoas.map(nome).join(", ") : "Sem responsável"),
        render: (t) => (t.pessoas.length ? t.pessoas.map(nome).join(", ") : <span className="text-faint">—</span>),
      },
    ];
  }, [porLista, porPessoa]);

  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="grid grid-cols-2 gap-[var(--gap-block)] lg:grid-cols-5">
        <div className="col-span-2 lg:col-span-1">
          <KpiStat
            label="Tarefas abertas"
            value={num(p.abertas)}
            hint={`${plural(p.semResponsavel, "sem responsável", "sem responsável")} · ${num(semanaAtual?.criadas ?? 0)} criada(s) nesta semana`}
            spark={pico > 0 ? p.semanas.slice(-7).map((s) => (s.criadas / pico) * 100) : undefined}
          />
        </div>
        <KpiStat label="Atrasadas" value={num(p.faixas.atrasada)} cor={p.faixas.atrasada ? "var(--danger)" : "var(--ok)"} hint={p.abertas ? `${pct(p.faixas.atrasada, p.abertas)} das abertas` : "nenhuma aberta"} />
        <KpiStat label="Vencem em até 2 dias" value={num(p.faixas.vence)} cor="var(--warn)" hint="inclui as que vencem hoje" />
        <KpiStat
          label="Concluídas no mês"
          value={num(p.concluidasMes)}
          cor="var(--ok)"
          hint={p.noPrazo == null ? "nenhuma concluída com prazo" : `${num(Math.round(p.noPrazo))}% terminaram no prazo`}
        />
        <KpiStat
          label="Tempo médio até concluir"
          value={p.leadTime == null ? "—" : plural(Math.round(p.leadTime), "dia", "dias")}
          cor="var(--info)"
          hint="da criação à conclusão"
        />
      </div>

      <div className="grid grid-cols-1 gap-[var(--gap-block)] md:grid-cols-2 xl:grid-cols-3">
        <ChartCard title="Saúde dos prazos" subtitle="As tarefas abertas pelo semáforo do prazo">
          {vazio ? (
            <ChartEmpty label="Nenhuma tarefa aberta" />
          ) : (
            <div className="space-y-3">
              <div className="flex items-baseline gap-2">
                <span className="text-[2rem] font-bold leading-none tracking-[-0.03em] text-text">{pct(p.faixas.ok, p.abertas)}</span>
                <span className="text-[12.5px] text-muted">no prazo ou sem prazo</span>
              </div>
              <BarraSegmentada trilho altura={12} segmentos={segmentosFaixa(p.faixas)} />
              <ul aria-label="Tarefas abertas por prazo" className="space-y-1">
                {FAIXAS_PRAZO.map((f) => (
                  <li key={f}>
                    <button
                      type="button"
                      onClick={() => abrir("Saúde dos prazos", ROTULO_FAIXA[f], { dim: "faixa", faixa: f })}
                      aria-label={`${ROTULO_FAIXA[f]}: ${plural(p.faixas[f], "tarefa", "tarefas")} — ver a origem dos dados`}
                      className="grid min-h-11 w-full grid-cols-[minmax(0,1fr)_auto_3.5rem] items-center gap-x-3 rounded-control px-1.5 text-[12.5px] transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 lg:min-h-8"
                    >
                      <span className="inline-flex min-w-0 items-center gap-2 text-text-2">
                        <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COR_FAIXA[f] }} />
                        <span className="truncate">{ROTULO_FAIXA[f]}</span>
                      </span>
                      <span className="text-right font-semibold text-text tabular-nums">{num(p.faixas[f])}</span>
                      <span className="text-right text-muted tabular-nums">{pct(p.faixas[f], p.abertas)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Carga por pessoa" subtitle="Abertas por responsável e prazo — toque numa pessoa para filtrar o quadro">
          {vazio ? (
            <ChartEmpty label="Nenhuma tarefa aberta" />
          ) : (
            <>
              <ul aria-label="Legenda dos prazos" className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-muted">
                {FAIXAS_PRAZO.map((f) => (
                  <li key={f} className="inline-flex items-center gap-1.5">
                    <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: COR_FAIXA[f] }} />
                    {ROTULO_FAIXA[f]}
                  </li>
                ))}
              </ul>
              <BarrasH
                ariaLabel="Tarefas abertas por pessoa"
                linhas={linhasCarga}
                ativa={ativaResp}
                onEscolher={(k) => onResponsavel(k === ativaResp ? "todos" : k === "sem" ? "sem" : Number(k))}
              />
            </>
          )}
        </ChartCard>

        <ChartCard title="Tarefas por lista" subtitle="Os cartões de cada lista (âmbar = acima do limite)">
          {p.porLista.length === 0 ? (
            <ChartEmpty label="Nenhuma lista ativa" />
          ) : (
            <BarrasH
              ariaLabel="Tarefas por lista"
              linhas={linhasLista}
              acao="ver a origem dos dados"
              onEscolher={(k) => abrir("Tarefas por lista", porLista.get(Number(k)) ?? "", { dim: "lista", id: Number(k) })}
            />
          )}
        </ChartCard>

        <ChartCard title="Abertas por prioridade" subtitle="Da urgente à baixa">
          {vazio ? (
            <ChartEmpty label="Nenhuma tarefa aberta" />
          ) : (
            <BarrasH
              ariaLabel="Tarefas abertas por prioridade"
              linhas={linhasPrio}
              acao="ver a origem dos dados"
              onEscolher={(k) => {
                const x = p.porPrioridade.find((y) => y.prioridade === k);
                if (x) abrir("Abertas por prioridade", ROTULO_PRIORIDADE[x.prioridade], { dim: "prioridade", prioridade: x.prioridade });
              }}
            />
          )}
        </ChartCard>

        {(["criadas", "concluidas"] as const).map((serie) => (
          <ChartCard
            key={serie}
            title={serie === "criadas" ? "Entrada de tarefas" : "Tarefas concluídas"}
            subtitle={`Por semana — últimas ${SEMANAS_TAREFAS} semanas`}
            action={<span className="whitespace-nowrap text-[12px] font-semibold text-text-2 tabular-nums">{num(p.semanas.reduce((t, s) => t + s[serie], 0))} no período</span>}
          >
            <Colunas
              ariaLabel={serie === "criadas" ? "Tarefas criadas por semana" : "Tarefas concluídas por semana"}
              cor={serie === "criadas" ? "var(--accent)" : "var(--ok)"}
              onEscolher={(inicio) => {
                const w = p.semanas.find((s) => s.inicio === inicio);
                if (w) abrir(serie === "criadas" ? "Entrada de tarefas" : "Tarefas concluídas", `Semana de ${w.rotulo}${w.atual ? " (atual)" : ""}`, { dim: "semana", inicio, serie });
              }}
              colunas={p.semanas.map((s) => ({
                chave: s.inicio,
                rotulo: s.rotulo,
                valor: s[serie],
                dica: { valor: plural(s[serie], serie === "criadas" ? "criada" : "concluída", serie === "criadas" ? "criadas" : "concluídas"), rotulo: `Semana de ${s.rotulo}${s.atual ? " (atual)" : ""}` },
              }))}
            />
          </ChartCard>
        ))}
      </div>

      <OrigemDados
        aberto={origem != null}
        onClose={() => setOrigem(null)}
        titulo={origem?.quadro ?? ""}
        recorte={origem?.rotulo ?? ""}
        resumo={[
          { label: "Tarefas", value: num(lista.length) },
          { label: "Atrasadas", value: num(lista.filter((t) => !t.concluidaEm && t.prazo != null && t.prazo < hoje).length) },
        ]}
        fonte="As tarefas deste quadro (arquivadas fora), já filtradas pela barra do topo — a mesma lista das abas Quadro e Lista."
      >
        <DataTable
          columns={colunas}
          rows={lista}
          getKey={(t) => t.id}
          pageSize={20}
          minWidth={560}
          onRowClick={(t) => onAbrir(t.id)}
          resumo={(ls) => plural(ls.length, "tarefa", "tarefas")}
        />
      </OrigemDados>
    </div>
  );
}
