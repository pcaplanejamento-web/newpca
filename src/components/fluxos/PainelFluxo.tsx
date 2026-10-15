"use client";

import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { campoVisivel, type Grafo, type Item, type NoFluxo, nomeDoNo, type PassoExec, type ResultadoExec } from "@/lib/fluxo-core";
import { corCategoria, REGISTRO_NOS } from "@/lib/fluxo-nos";
import { contagemDfds } from "@/lib/automacao-dfds-estado";
import { dataHoraBR } from "@/lib/format";
import { progressoFluxo, textoDuracao, textoPct } from "@/lib/fluxo-progresso";
import { useAlturaTela } from "../AlturaCheia";
import { Badge, type Tone } from "../Badge";
import { type Column, DataTable } from "../DataTable";
import { Progress } from "../Progress";
import { Segmented } from "../Segmented";
import { StatMini } from "../StatMini";
import { TabelaMesaFluxo } from "./TabelaMesaFluxo";
import { AjudaNo } from "./AjudaNo";
import { IconeNo } from "./IconeNo";
import { useEstimativa } from "./useEstimativa";
import { CampoDoNo } from "./PainelNo";
import { estadoDoItem, HostPainelCtx, rotuloItem, TesteProtocoloCenti, useExecutarSelecionados, VISOES } from "./paineis";

const CARTAO = "rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring";

const ESTADO: Record<PassoExec["estado"], { rotulo: string; tom: Tone }> = {
  fila: { rotulo: "Na fila", tom: "slate" },
  rodando: { rotulo: "Executando", tom: "blue" },
  ok: { rotulo: "Concluído", tom: "emerald" },
  erro: { rotulo: "Falhou", tom: "red" },
  ignorado: { rotulo: "Pulado", tom: "slate" },
};
const s = (v: unknown) => (v == null ? "" : String(v));
const ANALISE = "__analise";

/** As etapas na ORDEM do fluxo (da esquerda para a direita, de cima para baixo), sem o Início. */
const etapasDoGrafo = (g: Grafo): NoFluxo[] => g.nos.filter((n) => n.tipo !== "gatilho.inicio").sort((a, b) => a.x - b.x || a.y - b.y);

type Apontado = { nivel: string; mensagem: string; item: string };
type Processado = { chave: string; item: string; orgao: string; estado: { rotulo: string; tom: Tone; texto: string } };

/**
 * O PAINEL de um fluxo (a tela inicial; o diagrama só ao montar), o MESMO para qualquer fluxo: à esquerda os DADOS DE
 * ENTRADA (os campos `entrada` dos componentes) e as ETAPAS ao vivo; à direita as ABAS que os componentes trazem (seleção,
 * DFDs, protocolos lidos — `VISOES`) e a ANÁLISE, que acompanha cada item processado em tempo real e, ao terminar, os
 * apontamentos. No desktop ocupa o display (a página não rola — cada parte rola por dentro).
 */
export function PainelFluxo({
  grafo,
  onGrafo,
  passos,
  resultado,
  rodando,
  ultima,
}: {
  grafo: Grafo;
  onGrafo: (g: Grafo) => void;
  passos: Record<string, PassoExec>;
  resultado: ResultadoExec | null;
  rodando: boolean;
  /** A última execução gravada (quando esta tela ainda não executou). */
  ultima: { em: string | null; resumo: Record<string, unknown> | null };
}) {
  const host = useContext(HostPainelCtx);
  const ref = useRef<HTMLDivElement>(null);
  const altura = useAlturaTela(ref, 420);
  const etapas = useMemo(() => etapasDoGrafo(grafo), [grafo]);
  const entradas = etapas
    .map((n) => {
      const def = REGISTRO_NOS.get(n.tipo);
      const campos = (def?.campos ?? []).filter((c) => c.entrada && campoVisivel(c, n.config, def?.campos));
      return def && campos.length && !n.desativado ? { n, def, campos } : null;
    })
    .filter((x) => !!x);
  const mudar = (no: NoFluxo, chave: string, v: unknown) =>
    onGrafo({ ...grafo, nos: grafo.nos.map((x) => (x.id === no.id ? { ...x, config: { ...x.config, [chave]: v } } : x)) });

  // As ABAS: as visões dos componentes do fluxo + a Análise.
  const visoes = etapas.filter((n) => VISOES[n.tipo] && !n.desativado);
  const opcoes = [...visoes.map((n) => ({ value: n.id, label: VISOES[n.tipo].titulo })), { value: ANALISE, label: "Análise" }];
  const [aba, setAba] = useState<string>(opcoes[0].value);
  const abaValida = opcoes.some((o) => o.value === aba) ? aba : opcoes[0].value;
  // Ao executar, a aba que acompanha ao vivo: a dos DFDs (Baixar/anexar), senão a Análise.
  const rodandoAntes = useRef(rodando);
  useEffect(() => {
    if (rodando && !rodandoAntes.current) setAba(visoes.find((n) => n.tipo === "saida.dfdsCenti")?.id ?? ANALISE);
    rodandoAntes.current = rodando;
  }, [rodando, visoes]);

  const feitas = etapas.filter((n) => ["ok", "erro", "ignorado"].includes(passos[n.id]?.estado ?? "")).length;
  // O progresso REAL: cada etapa pesa o trabalho que faz (o Baixar/anexar = os DFDs) e a em curso conta pela fração medida.
  const dfds = host?.dfds ? contagemDfds(host.dfds) : null;
  const medida = (n: NoFluxo) => (n.tipo === "saida.dfdsCenti" && dfds && dfds.total ? { feito: dfds.concluidas, total: dfds.total } : null);
  const fracao = progressoFluxo(
    etapas.map((n) => {
      const m = medida(n);
      return { estado: passos[n.id]?.estado, fracao: m ? m.feito / m.total : null, peso: m ? m.total : 1 };
    }),
  );
  const restante = useEstimativa(fracao, rodando);
  const terminou = !rodando && etapas.length > 0 && feitas === etapas.length;
  const atual = etapas.find((n) => passos[n.id]?.estado === "rodando");
  const noAberto = visoes.find((n) => n.id === abaValida);
  const Visao = noAberto ? VISOES[noAberto.tipo].Componente : null;

  return (
    <div
      ref={ref}
      style={altura ? ({ "--h-painel": `${altura}px` } as React.CSSProperties) : undefined}
      className="grid gap-[var(--gap-block)] lg:h-[var(--h-painel)] lg:grid-cols-[20rem_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]"
    >
      <aside className="flex min-h-0 flex-col gap-[var(--gap-block)] lg:overflow-y-auto">
        {entradas.length > 0 && (
          <section className={CARTAO} aria-labelledby="fluxo-entradas">
            <h3 id="fluxo-entradas" className="mb-3 text-sm font-semibold text-text">
              Dados de entrada
            </h3>
            <div className="space-y-4">
              {entradas.map(({ n, def, campos }) => (
                <fieldset key={n.id} className="space-y-2">
                  <legend className="mb-1 flex items-center gap-2 text-xs font-semibold text-muted">
                    <span className="flex size-5 items-center justify-center rounded text-white" style={{ background: corCategoria(def.categoria) }}>
                      <IconeNo nome={def.icone} className="size-3" />
                    </span>
                    {def.rotulo}
                    <AjudaNo def={def} />
                  </legend>
                  {campos.map((c) => (
                    <CampoDoNo key={c.chave} campo={c} valor={n.config[c.chave] ?? c.padrao} onValor={(v) => mudar(n, c.chave, v)} config={n.config} somenteLeitura={rodando} />
                  ))}
                  {n.tipo === "saida.dfdsCenti" && <TesteProtocoloCenti no={n} onNumero={(v) => mudar(n, "alvoNumero", v)} desabilitado={rodando} />}
                </fieldset>
              ))}
            </div>
          </section>
        )}
        <section className={CARTAO} aria-labelledby="fluxo-etapas">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 id="fluxo-etapas" className="text-sm font-semibold text-text">
              Etapas
            </h3>
            <span className="text-xs tabular-nums text-muted" aria-live="polite">
              {rodando || terminou ? `${textoPct(fracao, terminou)} · ` : ""}
              {feitas}/{etapas.length}
            </span>
          </div>
          {(rodando || terminou) && <Progress value={terminou ? 100 : fracao * 100} />}
          {rodando && <p className="mt-1 text-xs tabular-nums text-muted">{restante == null ? "Calculando o tempo restante…" : `Termina em ${textoDuracao(restante)}`}</p>}
          <ol className="mt-2 space-y-1.5">
            {etapas.map((n) => {
              const def = REGISTRO_NOS.get(n.tipo);
              const p = passos[n.id];
              const e = p ? ESTADO[p.estado] : null;
              const vivos = host?.parciais[n.id]?.length ?? 0;
              const m = medida(n);
              return (
                <li key={n.id} className={`flex items-start gap-2 rounded-md ${p?.estado === "rodando" ? "-mx-1 bg-[color-mix(in_oklab,var(--accent)_8%,transparent)] px-1 py-0.5" : ""}`}>
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md text-white" style={{ background: def ? corCategoria(def.categoria) : "var(--muted)" }}>
                    <IconeNo nome={def?.icone ?? "alert"} className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[13px] text-text">{def?.rotulo ?? n.tipo}</span>
                      {p?.estado === "rodando" && m ? (
                        <span className="text-xs tabular-nums text-muted">
                          {m.feito}/{m.total}
                        </span>
                      ) : (
                        p && p.estado !== "fila" && <span className="text-xs tabular-nums text-muted">{p.estado === "rodando" && vivos ? vivos : p.itens}</span>
                      )}
                      {e && <Badge tone={e.tom}>{e.rotulo}</Badge>}
                      {def && <AjudaNo def={def} />}
                    </div>
                    {p?.estado === "erro" && <p className="text-xs text-[var(--danger)]">{p.erro}</p>}
                    {p?.estado === "rodando" && m && <div className="mt-1"><Progress value={(m.feito / m.total) * 100} /></div>}
                    {p?.estado === "rodando" && (dfds?.atual ? <p className="truncate text-xs text-muted">Agora: Planej. {dfds.atual.id}{dfds.atual.dfd ? ` · DFD ${dfds.atual.dfd}` : ""}</p> : p.aviso && <p className="truncate text-xs text-muted">{p.aviso}</p>)}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      </aside>
      <section className={`${CARTAO} flex min-h-[28rem] min-w-0 flex-col gap-3 lg:min-h-0`}>
        {opcoes.length > 1 && <Segmented ariaLabel="Visões do fluxo" value={abaValida} onChange={setAba} options={opcoes} className="self-start" />}
        <div className="flex min-h-0 flex-1 flex-col">
          {Visao && noAberto ? (
            <Visao no={noAberto} grafo={grafo} onGrafo={onGrafo} />
          ) : (
            <AnaliseAoVivo grafo={grafo} etapas={etapas} passos={passos} resultado={resultado} rodando={rodando} atual={atual} ultima={ultima} />
          )}
        </div>
      </section>
    </div>
  );
}

/** A ANÁLISE: o andamento e cada item processado AO VIVO (o componente que processa itens um a um) e, ao terminar, os
 * apontamentos — números + tabelas exportáveis. */
function AnaliseAoVivo({
  grafo,
  etapas,
  passos,
  resultado,
  rodando,
  atual,
  ultima,
}: {
  grafo: Grafo;
  etapas: NoFluxo[];
  passos: Record<string, PassoExec>;
  resultado: ResultadoExec | null;
  rodando: boolean;
  atual: NoFluxo | undefined;
  ultima: { em: string | null; resumo: Record<string, unknown> | null };
}) {
  const host = useContext(HostPainelCtx);
  // O componente que processa item a item (o de agora; senão o último que processou).
  // O Baixar/anexar DFDs não entrega parciais: o andamento dele são as linhas dos DFDs (`host.dfds`, ao vivo e no fim).
  const noDfds = etapas.find((n) => n.tipo === "saida.dfdsCenti") ?? null;
  const anexarDfds = !!noDfds && String(noDfds.config?.destino ?? "pasta") !== "pasta";
  const fonte = useMemo(() => {
    const comItens = etapas.filter((n) => host?.parciais[n.id]?.length);
    if (atual && host?.parciais[atual.id]?.length) return atual;
    if (noDfds && host?.dfds?.length && (atual?.id === noDfds.id || !comItens.length)) return noDfds;
    return comItens[comItens.length - 1] ?? null;
  }, [etapas, atual, host, noDfds]);
  const itensFonte: Item[] = fonte
    ? fonte === noDfds && host?.dfds?.length
      ? (host.dfds as unknown as Item[])
      : (host?.saidas[fonte.id] ?? host?.parciais[fonte.id] ?? [])
    : [];
  const processados = useMemo<Processado[]>(
    () =>
      fonte
        ? itensFonte
            // Na ORDEM em que foram processados (os novos entram no fim — rolar a tabela durante a execução não pula).
            .map((it, i) => ({
              chave: String(i),
              item: rotuloItem(it),
              orgao: s(it.orgaoNome) || s(it.orgao) || (s(it.entidade) ? `Centi ${s(it.entidade)}` : ""),
              estado: estadoDoItem(fonte.tipo, fonte === noDfds ? { ...it, anexar: anexarDfds } : it) ?? { rotulo: "Processado", tom: "slate" as Tone, texto: "" },
            }))
        : [],
    [fonte, itensFonte, noDfds, anexarDfds],
  );
  // Marcar itens do resultado e rodar o fluxo de novo só com eles (quando o fluxo os recebe).
  const exec = useExecutarSelecionados(grafo, rodando ? [] : itensFonte, (it) => itensFonte.indexOf(it));
  // Quantos itens entram no componente (o que os anteriores entregaram) — o andamento "n de N".
  const total = fonte ? Math.max(itensFonte.length, ...etapas.filter((n) => n.x < fonte.x).map((n) => passos[n.id]?.itens ?? 0)) : 0;
  const conta = (tons: Tone[]) => processados.filter((p) => tons.includes(p.estado.tom)).length;
  const apontados = useMemo<Apontado[]>(
    () =>
      (resultado?.apontados ?? []).map((a) => ({
        nivel: s(a.nivel) === "atencao" ? "Atenção" : "Erro",
        mensagem: s(a.mensagem),
        item: a.item && typeof a.item === "object" ? rotuloItem(a.item as Item) : "",
      })),
    [resultado],
  );
  // A tabela ao vivo é a da MESA quando os itens são protocolos, DFDs ou itens (o toque abre o banner); o Órgão, o Estado e o
  // Detalhe do componente vão no fim de qualquer tipo.
  const estadoDe = (it: Item) => processados[itensFonte.indexOf(it)]?.estado ?? { rotulo: "Processado", tom: "slate" as Tone, texto: "" };
  const orgaoDe = (it: Item) => processados[itensFonte.indexOf(it)]?.orgao ?? "";
  const genericasVivo: Column<Item>[] = [{ key: "item", header: "Item", nowrap: true, align: "left", value: (it) => rotuloItem(it), render: (it) => rotuloItem(it) }];
  const extrasVivo: Column<Item>[] = [
    ...(processados.some((p) => p.orgao) ? [{ key: "orgao", header: "Órgão", align: "left" as const, minWidth: 160, value: (it: Item) => orgaoDe(it) || "—", render: (it: Item) => <span className="whitespace-normal">{orgaoDe(it) || "—"}</span> }] : []),
    { key: "estadoEtapa", header: "Estado", nowrap: true, value: (it) => estadoDe(it).rotulo, render: (it) => <Badge tone={estadoDe(it).tom} dot>{estadoDe(it).rotulo}</Badge> },
    { key: "detalhe", header: "Detalhe", align: "left", minWidth: 240, value: (it) => estadoDe(it).texto, render: (it) => <span className="whitespace-normal text-muted">{estadoDe(it).texto || "—"}</span> },
  ];
  const colunasAp: Column<Apontado>[] = [
    { key: "nivel", header: "Nível", nowrap: true, value: (a) => a.nivel, render: (a) => <Badge tone={a.nivel === "Erro" ? "red" : "amber"} dot>{a.nivel}</Badge> },
    { key: "item", header: "Item", nowrap: true, align: "left", value: (a) => a.item || "—", render: (a) => a.item || "—" },
    { key: "mensagem", header: "Apontamento", align: "left", minWidth: 320, value: (a) => a.mensagem, render: (a) => <span className="whitespace-normal">{a.mensagem}</span> },
  ];

  const situacao = rodando
    ? { rotulo: "Executando", tom: "blue" as Tone }
    : resultado
      ? resultado.estado === "concluido"
        ? { rotulo: "Concluído", tom: "emerald" as Tone }
        : resultado.estado === "cancelado"
          ? { rotulo: "Interrompido", tom: "amber" as Tone }
          : { rotulo: "Falhou", tom: "red" as Tone }
      : null;
  const resumo = ultima.resumo;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      <div className="flex flex-wrap items-center gap-2">
        {situacao ? <Badge tone={situacao.tom} dot>{situacao.rotulo}</Badge> : <Badge tone="slate">Pronto para executar</Badge>}
        <span className="min-w-0 flex-1 truncate text-sm text-muted">
          {rodando
            ? (atual && passos[atual.id]?.aviso) || "Executando…"
            : resultado
              ? (resultado.erro ?? `Terminou ${dataHoraBR(resultado.fim)}`)
              : resumo
                ? `Última execução${ultima.em ? ` ${dataHoraBR(ultima.em)}` : ""}: ${s(resumo.estado) === "concluido" ? "concluída" : s(resumo.estado) === "cancelado" ? "interrompida" : "falhou"} · ${s(resumo.apontados || 0)} apontamento(s)`
                : "Ajuste os dados de entrada e toque em Executar."}
        </span>
      </div>
      {fonte && rodando && total > 0 && <Progress value={(itensFonte.length / total) * 100} label={`${itensFonte.length} de ${total}`} />}
      {(processados.length > 0 || resultado) && (
        <div className="grid grid-cols-2 gap-[var(--gap-block)] sm:grid-cols-4">
          <StatMini label="Processados" value={processados.length.toLocaleString("pt-BR")} hint={total ? `de ${total.toLocaleString("pt-BR")}` : undefined} />
          <StatMini label="Ok" value={conta(["emerald"]).toLocaleString("pt-BR")} tone="ok" />
          <StatMini label="Atenção" value={conta(["amber"]).toLocaleString("pt-BR")} tone={conta(["amber"]) ? "warn" : "default"} />
          <StatMini
            label={resultado ? "Apontamentos" : "Falhas"}
            value={(resultado ? apontados.length : conta(["red"])).toLocaleString("pt-BR")}
            tone={(resultado ? apontados.length : conta(["red"])) ? "danger" : "default"}
          />
        </div>
      )}
      {resultado && apontados.length > 0 && (
        <div className="space-y-1">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Apontamentos</h4>
          <DataTable columns={colunasAp} rows={apontados} getKey={(r) => apontados.indexOf(r)} density="compact" exportar={{ nome: "Apontamentos do fluxo" }} pageSize={10} />
        </div>
      )}
      {processados.length > 0 && (
        <div className="space-y-1">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
            {fonte ? `${nomeDoNo(fonte, REGISTRO_NOS)} · ${rodando ? "ao vivo" : "resultado"}` : "Itens"}
          </h4>
          {host && (
            <TabelaMesaFluxo
              itens={itensFonte}
              chave={(it) => itensFonte.indexOf(it)}
              genericas={genericasVivo}
              extras={extrasVivo}
              gestao={host.gestao}
              onAbrir={host.abrir}
              selected={exec?.selected}
              onSelected={exec?.onSelected}
              acoesRodape={exec?.acao}
              scrollInterno={false}
              exportar={{ nome: "Itens processados" }}
              linhasSalvas="automacao:itens-processados"
            />
          )}
        </div>
      )}
    </div>
  );
}
