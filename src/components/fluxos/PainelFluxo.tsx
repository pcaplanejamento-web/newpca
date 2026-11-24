"use client";

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { campoVisivel, type Grafo, type Item, type NoFluxo, nomeDoNo, type PassoExec, type ResultadoExec } from "@/lib/fluxo-core";
import { corCategoria, REGISTRO_NOS } from "@/lib/fluxo-nos";
import { aberturaDoItem, tipoDosItens } from "@/lib/fluxo-tipo-item";
import { contagemDfds } from "@/lib/automacao-dfds-estado";
import { textoPlanejamentos } from "@/lib/dfd-tratamento";
import { dataHoraBR, num } from "@/lib/format";
import { progressoFluxo, textoDuracao, textoPct } from "@/lib/fluxo-progresso";
import { FOLGA, useAlturaTela } from "../AlturaCheia";
import { Badge, type Tone } from "../Badge";
import { BarraSelecao } from "../BarraSelecao";
import { BotaoCopiar } from "../BotaoCopiar";
import { IconRefresh } from "../icons";
import { Button } from "../Button";
import { type Column, DataTable } from "../DataTable";
import { colunaPlanejamento } from "../PlanilhaDfds";
import { Progress } from "../Progress";
import { Segmented } from "../Segmented";
import { ListaMensagens, PainelSelo, SeloComPainel } from "../SeloComPainel";
import { StatMini } from "../StatMini";
import { type AcoesCenti, ProvedorAcoesCenti } from "../CelulaExecucao";
import { useConfirmacao } from "../Confirmacao";
import { toast } from "../Toast";
import { TabelaMesaFluxo } from "./TabelaMesaFluxo";
import { AjudaNo } from "./AjudaNo";
import { IconeNo } from "./IconeNo";
import { useEstimativa } from "./useEstimativa";
import { CampoDoNo } from "./PainelNo";
import { estadoDoItem, HostPainelCtx, rotuloItem, TesteProtocoloCenti, tituloVisao, useExecutarSelecionados, VISOES } from "./paineis";

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

type Apontado = { key: number; nivel: string; mensagem: string; item: string; planejamento: string };

/** O nº de planejamento do item apontado — a MESMA regra do `rotuloItem`: a linha do Baixar/anexar DFDs (o `id` é o
 * planejamento) ou o DFD (`planejamento`). Outro item (ex.: protocolo) = "". */
const planejamentoDoApontado = (it: Item): string => ("estado" in it && "dfd" in it && "grupo" in it ? s(it.id) : s(it.planejamento)).trim();
type Processado = { chave: string; item: string; orgao: string; estado: { rotulo: string; tom: Tone; texto: string } };

/**
 * O PAINEL de um fluxo (a tela inicial; o diagrama só ao montar), o MESMO para qualquer fluxo: à esquerda os DADOS DE
 * ENTRADA (os campos `entrada` dos componentes) e as ETAPAS ao vivo; à direita as ABAS que os componentes trazem (seleção,
 * DFDs, protocolos lidos — `VISOES`) e a ANÁLISE, que acompanha cada item processado em tempo real e, ao terminar, os
 * apontamentos. No desktop ocupa o display (a página não rola — cada parte rola por dentro).
 */
/** O tom do cartão (StatMini) pelo tom do selo do resultado. */
const TOM_STAT: Partial<Record<Tone, "ok" | "warn" | "danger">> = { emerald: "ok", amber: "warn", red: "danger" };

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
  // Sem a folga de arredondamento: o fim do cartão fica à MESMA distância do display que a barra do topo tem do cabeçalho
  // (--pad-canvas-y nos dois) — a altura já é arredondada para baixo.
  const altura = useAlturaTela(ref, 420, -FOLGA);
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
  const opcoes = [...visoes.map((n) => ({ value: n.id, label: tituloVisao(n) })), { value: ANALISE, label: "Análise" }];
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
  const { acoes: acoesCenti, confirmacao: confirmacaoCenti } = useAcoesCentiDoFluxo(grafo, passos);

  return (
    <div
      ref={ref}
      style={altura ? ({ "--h-painel": `${altura}px` } as React.CSSProperties) : undefined}
      className="!mb-0 grid gap-[var(--gap-block)] lg:h-[var(--h-painel)] lg:grid-cols-[20rem_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]"
    >
      <aside className="flex min-h-0 flex-col gap-[var(--gap-block)] lg:overflow-y-auto">
        {entradas.length > 0 && (
          <section className={CARTAO} aria-labelledby="fluxo-entradas">
            <h3 id="fluxo-entradas" className="text-sm font-semibold text-text">
              Dados de entrada
            </h3>
            {/* Um BLOCO por componente, um sobre o outro, separados por uma linha com o MESMO respiro; dentro, o nome do
                componente e os campos com o mesmo espaço entre si. */}
            <div className="mt-3 divide-y divide-border">
              {entradas.map(({ n, def, campos }) => (
                <fieldset key={n.id} className="flex min-w-0 flex-col gap-3 py-3 first:pt-0 last:pb-0">
                  <legend className="contents">
                    <span className="flex items-center gap-2 text-[13px] font-semibold text-text">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-md text-white" style={{ background: corCategoria(def.categoria) }}>
                        <IconeNo nome={def.icone} className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{def.rotulo}</span>
                      <AjudaNo def={def} />
                    </span>
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
          <div className="flex items-center justify-between gap-2">
            <h3 id="fluxo-etapas" className="text-sm font-semibold text-text">
              Etapas
            </h3>
            <span className="text-xs tabular-nums text-muted" aria-live="polite">
              {rodando || terminou ? `${textoPct(fracao, terminou)} · ` : ""}
              {feitas}/{etapas.length}
            </span>
          </div>
          {(rodando || terminou) && (
            <div className="mt-3">
              <Progress value={terminou ? 100 : fracao * 100} />
            </div>
          )}
          {rodando && <p className="mt-1 text-xs tabular-nums text-muted">{restante == null ? "Calculando o tempo restante…" : `Termina em ${textoDuracao(restante)}`}</p>}
          <ol className="mt-3 space-y-2">
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
      {/* `data-altura-limite`: as tabelas `scrollInterno` aqui dentro terminam no fundo deste cartão, com o mesmo
          afastamento do contorno nos quatro lados (`limiteDoBloco`). */}
      <section data-altura-limite className={`${CARTAO} flex min-h-[28rem] min-w-0 flex-col gap-3 lg:min-h-0`}>
        {opcoes.length > 1 && <Segmented ariaLabel="Visões do fluxo" value={abaValida} onChange={setAba} options={opcoes} className="self-start" />}
        <ProvedorAcoesCenti value={acoesCenti}>
          <div className="flex min-h-0 flex-1 flex-col">
            {Visao && noAberto ? (
              <Visao no={noAberto} grafo={grafo} onGrafo={onGrafo} />
            ) : (
              <AnaliseAoVivo grafo={grafo} etapas={etapas} passos={passos} resultado={resultado} rodando={rodando} atual={atual} ultima={ultima} restante={rodando && restante != null ? `Termina em ${textoDuracao(restante)}` : null} />
            )}
          </div>
        </ProvedorAcoesCenti>
        {confirmacaoCenti}
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
  restante,
}: {
  grafo: Grafo;
  etapas: NoFluxo[];
  passos: Record<string, PassoExec>;
  resultado: ResultadoExec | null;
  rodando: boolean;
  atual: NoFluxo | undefined;
  ultima: { em: string | null; resumo: Record<string, unknown> | null };
  /** O tempo restante já em texto (só executando). */
  restante: string | null;
}) {
  const host = useContext(HostPainelCtx);
  // O componente que processa item a item (o de agora; senão o último que processou).
  // O Baixar/anexar DFDs não entrega parciais: o andamento dele são as linhas dos DFDs (`host.dfds`, ao vivo e no fim).
  const noDfds = etapas.find((n) => n.tipo === "saida.dfdsCenti") ?? null;
  const anexarDfds = !!noDfds && String(noDfds.config?.destino ?? "pasta") !== "pasta";
  // Sem componente item a item, os DFDs GRAVADOS pelo "Gravar execução" (todos os nós dele juntos) são o resultado.
  const gravacoes = etapas.filter((n) => n.tipo === "saida.gravarExecucao" && host?.saidas[n.id]?.length);
  const fonte = useMemo(() => {
    const comItens = etapas.filter((n) => host?.parciais[n.id]?.length);
    if (atual && host?.parciais[atual.id]?.length) return atual;
    if (noDfds && host?.dfds?.length && (atual?.id === noDfds.id || !comItens.length)) return noDfds;
    return comItens[comItens.length - 1] ?? gravacoes[gravacoes.length - 1] ?? null;
  }, [etapas, atual, host, noDfds, gravacoes]);
  const itensFonte: Item[] = fonte
    ? fonte === noDfds && host?.dfds?.length
      ? (host.dfds as unknown as Item[])
      : fonte.tipo === "saida.gravarExecucao" && !host?.parciais[fonte.id]?.length
        ? gravacoes.flatMap((n) => host?.saidas[n.id] ?? [])
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
  // A posição de cada item (a chave da linha) — um mapa, não um `indexOf` por célula (milhares de DFDs).
  const posicao = useMemo(() => new Map(itensFonte.map((it, i) => [it, i])), [itensFonte]);
  const pos = (it: Item) => posicao.get(it) ?? -1;
  // Marcar itens do resultado e rodar o fluxo de novo só com eles (quando o fluxo os recebe).
  const exec = useExecutarSelecionados(grafo, rodando ? [] : itensFonte, pos);
  // Quantos itens entram no componente (o que os anteriores entregaram) — o andamento "n de N".
  const total = fonte ? Math.max(itensFonte.length, ...etapas.filter((n) => n.x < fonte.x).map((n) => passos[n.id]?.itens ?? 0)) : 0;
  const jaAntes = fonte?.tipo === "fluxo.executar" && !rodando && resultado?.estado === "concluido" ? Math.max(0, total - processados.length) : 0;
  const conta = (tons: Tone[]) => processados.filter((p) => tons.includes(p.estado.tom)).length;
  // Quantos de cada resultado (pelo rótulo), na ordem verde › âmbar › vermelho › outros.
  const porResultado = useMemo(() => {
    const m = new Map<string, { rotulo: string; tom: Tone; n: number }>();
    for (const p of processados) {
      const x = m.get(p.estado.rotulo) ?? { rotulo: p.estado.rotulo, tom: p.estado.tom, n: 0 };
      x.n++;
      m.set(p.estado.rotulo, x);
    }
    const ordem = (t: Tone) => ({ emerald: 0, amber: 1, red: 2 })[t as string] ?? 3;
    return [...m.values()].sort((a, b) => ordem(a.tom) - ordem(b.tom) || b.n - a.n);
  }, [processados]);
  const apontados = useMemo<Apontado[]>(
    () =>
      (resultado?.apontados ?? []).map((a, key) => {
        const it = a.item && typeof a.item === "object" ? (a.item as Item) : null;
        return {
          key,
          nivel: s(a.nivel) === "atencao" ? "Atenção" : "Erro",
          mensagem: s(a.mensagem),
          item: it ? rotuloItem(it) : "",
          planejamento: it ? planejamentoDoApontado(it) : "",
        };
      }),
    [resultado],
  );
  // Selecionar os apontados para copiar os nºs de planejamento (só quando há DFDs entre eles); um resultado novo zera.
  const comPlanejamento = useMemo(() => apontados.some((a) => a.planejamento), [apontados]);
  const [selAp, setSelAp] = useState<Set<string | number>>(() => new Set());
  // biome-ignore lint/correctness/useExhaustiveDependencies: zera a seleção a cada resultado novo
  useEffect(() => setSelAp(new Set()), [apontados]);
  const selecionadosAp = useMemo(() => apontados.filter((a) => selAp.has(a.key)), [apontados, selAp]);
  const planejamentosSel = textoPlanejamentos(selecionadosAp.map((a) => a.planejamento));
  // A tabela ao vivo é a da MESA quando os itens são protocolos, DFDs ou itens (o toque abre o banner); o Órgão, o Estado e o
  // Detalhe do componente vão no fim de qualquer tipo.
  const estadoDe = (it: Item) => processados[pos(it)]?.estado ?? { rotulo: "Processado", tom: "slate" as Tone, texto: "" };
  const orgaoDe = (it: Item) => processados[pos(it)]?.orgao ?? "";
  // Nas linhas de DFD, a coluna Centi já abre o painel com o motivo: o detalhe vai na dica do Estado (sem coluna repetida).
  const soDfds = tipoDosItens(itensFonte) === "dfd";
  const genericasVivo: Column<Item>[] = [{ key: "item", header: "Item", nowrap: true, align: "left", value: (it) => rotuloItem(it), render: (it) => rotuloItem(it) }];
  const extrasVivo: Column<Item>[] = [
    ...(processados.some((p) => p.orgao) ? [{ key: "orgao", header: "Órgão", align: "left" as const, minWidth: 160, value: (it: Item) => orgaoDe(it) || "—", render: (it: Item) => <span className="whitespace-normal">{orgaoDe(it) || "—"}</span> }] : []),
    {
      key: "estadoEtapa",
      header: "Estado",
      nowrap: true,
      value: (it) => estadoDe(it).rotulo,
      // O toque no selo abre o PAINEL PADRÃO do selo com a mensagem inteira (não abre a linha).
      render: (it) => seloDoItem(it),
    },
    ...(soDfds
      ? []
      : [{ key: "detalhe", header: "Detalhe", align: "left" as const, minWidth: 240, value: (it: Item) => estadoDe(it).texto, render: (it: Item) => <span className="whitespace-normal text-muted">{estadoDe(it).texto || "—"}</span> }]),
  ];
  const apAtencao = apontados.filter((a) => a.nivel === "Atenção").length;
  // Os itens que entraram: a 1ª etapa de dados depois do Início (ex.: os DFDs do "Ler do sistema").
  const lidosNoInicio = passos[etapas.find((n) => !n.tipo.startsWith("gatilho."))?.id ?? ""]?.itens ?? 0;
  const colunasAp: Column<Apontado>[] = [
    { key: "nivel", header: "Nível", nowrap: true, value: (a) => a.nivel, render: (a) => <Badge tone={a.nivel === "Erro" ? "red" : "amber"} dot>{a.nivel}</Badge> },
    { key: "item", header: "Item", nowrap: true, align: "left", value: (a) => a.item || "—", render: (a) => a.item || "—" },
    ...(comPlanejamento ? [colunaPlanejamento<Apontado>((a) => a.planejamento || null)] : []),
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
  const textoSituacao = rodando
    ? (atual && passos[atual.id]?.aviso) || "Executando…"
    : resultado
      ? (resultado.erro ?? `Terminou ${dataHoraBR(resultado.fim)}`)
      : resumo
        ? `Última execução${ultima.em ? ` ${dataHoraBR(ultima.em)}` : ""}: ${s(resumo.estado) === "concluido" ? "concluída" : s(resumo.estado) === "cancelado" ? "interrompida" : "falhou"} · ${s(resumo.apontados || 0)} apontamento(s)`
        : "Ajuste os dados de entrada e toque em Executar.";
  // O PAINEL do selo de um item: o resultado, os dados que a pessoa reconhece, a mensagem inteira e as ações (copiar; abrir o
  // registro; executar de novo só com ele).
  // Uma FUNÇÃO (não um componente local): o painel aberto não é recriado a cada atualização ao vivo.
  const seloDoItem = (it: Item) => {
    const e = estadoDe(it);
    const msg = e.texto.trim();
    const dados = [s(it.numero) && `DFD ${s(it.numero)}`, s(it.planejamento) && `Planej. ${s(it.planejamento)}`, s(it.protocoloNumero ?? it.protocolo) && `Protocolo ${s(it.protocoloNumero ?? it.protocolo)}`, s(it.sigla), orgaoDe(it)]
      .filter(Boolean)
      .join(" · ");
    const abrir = host ? aberturaDoItem(it) : null;
    return (
      <SeloComPainel
        selo={
          <Badge tone={e.tom} dot>
            {e.rotulo}
          </Badge>
        }
        ariaLabel={`${e.rotulo} — ${rotuloItem(it)}`}
        title={msg ? `${msg} — toque para ver tudo` : "Ver o resultado deste item"}
      >
        {(fechar) => (
          <PainelSelo
            titulo={`${e.rotulo} — ${rotuloItem(it)}`}
            linha={[dados, fonte ? nomeDoNo(fonte, REGISTRO_NOS) : ""].filter(Boolean).join(" · ")}
            acoes={
              <>
                {msg && <BotaoCopiar texto={msg} rotulo="Copiar" titulo="Copiar a mensagem" />}
                {abrir && host && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      fechar();
                      host.abrir(abrir);
                    }}
                  >
                    {abrir.tipo === "protocolo" ? "Abrir o protocolo" : abrir.tipo === "item" ? "Abrir o item" : "Abrir o DFD"}
                  </Button>
                )}
                {exec && host && !rodando && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<IconRefresh className="h-4 w-4" />}
                    onClick={() => {
                      fechar();
                      host.executarCom(grafo, [it]);
                    }}
                  >
                    Executar de novo só com este
                  </Button>
                )}
              </>
            }
          >
            <ListaMensagens
              itens={[msg || (e.tom === "red" ? "A etapa falhou sem informar o motivo." : `${e.rotulo}.`)]}
              cor={e.tom === "red" ? "var(--danger)" : e.tom === "amber" ? "var(--warn)" : e.tom === "emerald" ? "var(--ok)" : "var(--muted)"}
            />
          </PainelSelo>
        )}
      </SeloComPainel>
    );
  };
  // O PAINEL do selo da execução: o que roda agora, o andamento, quantos de cada resultado e as falhas com a mensagem.
  const falhas = processados.filter((p) => p.estado.tom === "red" || p.estado.tom === "amber");
  const textoFalhas = falhas.map((p) => `${p.item}: ${p.estado.texto || p.estado.rotulo}`).join("\n");
  const tomPonto = (t: Tone) => (t === "red" ? "var(--danger)" : t === "amber" ? "var(--warn)" : "var(--muted)");
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[var(--gap-block)] overflow-y-auto">
      <div className="flex flex-wrap items-center gap-2">
        {situacao ? (
          <SeloComPainel
            selo={
              <Badge tone={situacao.tom} dot>
                {situacao.rotulo}
              </Badge>
            }
            ariaLabel={`Execução: ${situacao.rotulo}`}
            title="Ver a execução: o que roda agora e as falhas com a mensagem"
            align="start"
          >
            {(fechar) => (
              <PainelSelo
                titulo={`${situacao.rotulo}${fonte ? ` — ${nomeDoNo(fonte, REGISTRO_NOS)}` : ""}`}
                linha={textoSituacao}
                linhaTom={situacao.tom === "red" ? "danger" : "muted"}
                acoes={
                  textoFalhas || (jaAntes > 0 && fonte && host) ? (
                    <>
                      {textoFalhas && <BotaoCopiar texto={textoFalhas} rotulo="Copiar as falhas" titulo="Copiar cada item com a mensagem" />}
                      {jaAntes > 0 && fonte && host && (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<IconRefresh className="h-4 w-4" />}
                          onClick={() => {
                            fechar();
                            host.refazerTudo(grafo, fonte.id, jaAntes);
                          }}
                        >
                          Recomeçar do zero
                        </Button>
                      )}
                    </>
                  ) : undefined
                }
              >
                {total > 0 && (
                  <div className="space-y-1">
                    <Progress value={(Math.min(processados.length, total) / total) * 100} label={`${processados.length.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")}`} />
                    {restante && <p className="text-[12px] tabular-nums text-muted">{restante}</p>}
                  </div>
                )}
                {porResultado.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {porResultado.map((r) => (
                      <Badge key={r.rotulo} tone={r.tom} dot>
                        {r.rotulo} · {r.n.toLocaleString("pt-BR")}
                      </Badge>
                    ))}
                  </div>
                )}
                {falhas.length > 0 && (
                  <div className="max-h-[45vh] space-y-1 overflow-y-auto overscroll-contain pr-1">
                    {falhas.slice(0, 200).map((p) => (
                      <section key={p.chave} className="space-y-0.5">
                        <p className="text-[12px] font-medium text-muted">{p.item}</p>
                        <ListaMensagens itens={[p.estado.texto || p.estado.rotulo]} cor={tomPonto(p.estado.tom)} />
                      </section>
                    ))}
                    {falhas.length > 200 && <p className="text-[12px] text-muted">E mais {(falhas.length - 200).toLocaleString("pt-BR")} — copie para ver todas.</p>}
                  </div>
                )}
              </PainelSelo>
            )}
          </SeloComPainel>
        ) : (
          <Badge tone="slate">Pronto para executar</Badge>
        )}
        <span className="min-w-0 flex-1 truncate text-sm text-muted">
          {textoSituacao}
        </span>
      </div>
      {fonte && rodando && total > 0 && <Progress value={(itensFonte.length / total) * 100} label={`${itensFonte.length} de ${total}`} />}
      {!fonte && resultado && (
        // Sem itens processados um a um: os números saem dos APONTAMENTOS (nunca "Atenção 0" ao lado de 190 de atenção).
        <div className="grid grid-cols-2 gap-[var(--gap-block)] sm:grid-cols-4">
          <StatMini label="Itens lidos" value={lidosNoInicio.toLocaleString("pt-BR")} />
          <StatMini label="Atenção" value={apAtencao.toLocaleString("pt-BR")} tone={apAtencao ? "warn" : "default"} />
          <StatMini label="Erros" value={(apontados.length - apAtencao).toLocaleString("pt-BR")} tone={apontados.length - apAtencao ? "danger" : "default"} />
          <StatMini label="Apontamentos" value={apontados.length.toLocaleString("pt-BR")} tone={apontados.length ? "danger" : "default"} />
        </div>
      )}
      {fonte && (processados.length > 0 || resultado) && (
        // Terminada, o que a fonte não processou e os anteriores entregaram = os já feitos antes (a retomada pulou).
        <div className="grid grid-cols-2 gap-[var(--gap-block)] sm:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]">
          <StatMini label="Processados" value={processados.length.toLocaleString("pt-BR")} hint={total ? `de ${total.toLocaleString("pt-BR")}` : undefined} />
          {jaAntes > 0 && <StatMini label="Já feitos antes" value={jaAntes.toLocaleString("pt-BR")} hint="pulados pela retomada" />}
          {fonte.tipo === "fluxo.executar" ? (
            // Um cartão por RESULTADO (Convergente, Divergente, Não conferido, Corrigido, Falhou…) — nada fica junto em "Atenção".
            porResultado.map((r) => <StatMini key={r.rotulo} label={r.rotulo} value={r.n.toLocaleString("pt-BR")} tone={TOM_STAT[r.tom] ?? "default"} />)
          ) : (
            <>
              <StatMini label="Ok" value={conta(["emerald"]).toLocaleString("pt-BR")} tone="ok" />
              <StatMini label="Atenção" value={conta(["amber"]).toLocaleString("pt-BR")} tone={conta(["amber"]) ? "warn" : "default"} />
              <StatMini label="Falhas" value={conta(["red"]).toLocaleString("pt-BR")} tone={conta(["red"]) ? "danger" : "default"} hint={resultado && apontados.length ? `${apontados.length.toLocaleString("pt-BR")} apontamento(s)` : undefined} />
            </>
          )}
        </div>
      )}
      {jaAntes > 0 && fonte && host && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="min-w-0 flex-1">A retomada pulou os {jaAntes.toLocaleString("pt-BR")} já concluídos nesta rodada (com as mesmas escolhas); a próxima execução que terminar sem interrupção recomeça do zero.</span>
          <Button size="sm" variant="secondary" onClick={() => host.refazerTudo(grafo, fonte.id, jaAntes)}>
            Recomeçar do zero
          </Button>
        </div>
      )}
      {resultado && apontados.length > 0 && (
        // O título no padrão dos do painel ("Dados de entrada", "Etapas"): o MESMO respiro acima e até a tabela.
        <div className="space-y-[var(--gap-block)]">
          <h4 className="text-sm font-semibold text-text">Apontamentos</h4>
          <DataTable
            columns={colunasAp}
            rows={apontados}
            getKey={(r) => r.key}
            density="compact"
            exportar={{ nome: "Apontamentos do fluxo" }}
            pageSize={10}
            selectable={comPlanejamento}
            selected={selAp}
            onSelected={setSelAp}
          />
          {comPlanejamento && selecionadosAp.length > 0 && (
            <BarraSelecao
              registros={selecionadosAp.map((a) => ({ key: a.key, rotulo: a.item || `Apontamento ${a.key + 1}` }))}
              onRemover={(k) =>
                setSelAp((atual) => {
                  const n = new Set(atual);
                  n.delete(k);
                  return n;
                })
              }
              onLimpar={() => setSelAp(new Set())}
              resumo={
                <span>
                  {num(selecionadosAp.length)} apontamento{selecionadosAp.length === 1 ? "" : "s"} selecionado{selecionadosAp.length === 1 ? "" : "s"} ·{" "}
                  {num(planejamentosSel ? planejamentosSel.split(":").length : 0)} planejamento(s)
                </span>
              }
              acoes={
                <BotaoCopiar
                  texto={planejamentosSel}
                  rotulo="Copiar planejamentos"
                  titulo={planejamentosSel ? `Copia: ${planejamentosSel}` : "Os apontamentos selecionados não têm nº de planejamento"}
                />
              }
            />
          )}
        </div>
      )}
      {processados.length > 0 && (
        <div className="space-y-[var(--gap-block)]">
          <h4 className="text-sm font-semibold text-text">
            {fonte ? `${nomeDoNo(fonte, REGISTRO_NOS)} · ${rodando ? "ao vivo" : "resultado"}` : "Itens"}
          </h4>
          {host && (
            <TabelaMesaFluxo
              itens={itensFonte}
              chave={pos}
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

/**
 * As AÇÕES do painel de divergências da coluna Centi (o selo "Divergente") nas tabelas da automação — as MESMAS da Mesa:
 * reconferir e corrigir automaticamente (roda ESTE fluxo só com o DFD, sem gravar no "Reconferir"), corrigir dado a dado
 * (o banner do DFD na correção pela Centi) e as gravadas na conferência (recalcular, aceitar, desfazer o aceite). A tela da
 * Automação é só do Administrador.
 */
function useAcoesCentiDoFluxo(grafo: Grafo, passos: Record<string, PassoExec>): { acoes: AcoesCenti; confirmacao: React.ReactNode } {
  const host = useContext(HostPainelCtx);
  const { confirmar, confirmacao } = useConfirmacao();
  // Os DFDs conhecidos (as saídas, os ao vivo e as prévias): a automação recebe o DFD com nº e planejamento.
  const conhecidos = useCallback(
    (ids: number[]): Item[] => {
      const quer = new Set(ids);
      const achados = new Map<number, Item>();
      const listas = [...Object.values(host?.saidas ?? {}), ...Object.values(host?.parciais ?? {}), ...Object.values(host?.previas ?? {}).map((p) => p.itens ?? [])];
      for (const p of Object.values(passos)) for (const l of Object.values(p.amostra ?? {})) listas.push(l as Item[]);
      for (const l of listas)
        for (const it of l) {
          const id = Number(it.id);
          if (quer.has(id) && !achados.has(id)) achados.set(id, { id, numero: it.numero, planejamento: it.planejamento });
        }
      return ids.map((id) => achados.get(id) ?? { id });
    },
    [host, passos],
  );
  const servidor = useCallback(async (id: number, corpo: Record<string, unknown>) => {
    try {
      const r = await fetch(`/api/dfd/${id}/conferencia-centi`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; status?: string };
      if (!r.ok || !j.ok) {
        toast.error(j.error ?? "Não foi possível gravar.");
        return false;
      }
      const msg: Record<string, string> = {
        recalcular: j.status === "convergente" ? "Recalculado: agora confere com a Centi." : "Recalculado com os dados guardados da Centi.",
        aceitar: "Divergência aceita — o DFD fica “convergente com ressalva”.",
        desfazerAceite: "Aceite desfeito.",
        planejamento: "Nº de planejamento corrigido — reconfira na Centi.",
      };
      toast.success(`${msg[String(corpo.acao)] ?? "Gravado."} Execute de novo para atualizar a análise.`);
      return true;
    } catch {
      toast.error("Sem conexão com o sistema — tente de novo.");
      return false;
    }
  }, []);
  const acoes = useMemo<AcoesCenti>(() => {
    if (!host) return {};
    const rodar = (soConferir: boolean) => async (ids: number[]) => {
      if (host.rodando) return void toast.warning("A automação está em execução — espere terminar.");
      const n = ids.length;
      const ok = await confirmar({
        titulo: soConferir ? (n === 1 ? "Reconferir este DFD na Centi?" : `Reconferir ${n} DFDs na Centi?`) : n === 1 ? "Corrigir este DFD pela Centi?" : `Corrigir ${n} DFDs pela Centi?`,
        texto: soConferir
          ? "Roda esta automação só com o DFD: busca na Centi e compara de novo. Nada do DFD é alterado."
          : "Roda esta automação só com o DFD: busca na Centi, compara e troca pelos da Centi SÓ os dados que divergem (nº do DFD, planejamento, assinaturas, unidade, protocolo e PCA ficam os do sistema).",
        confirmar: soConferir ? "Reconferir" : "Corrigir",
      });
      if (ok) host.executarCom(grafo, conhecidos(ids), soConferir ? "conferir" : "corrigir");
    };
    return {
      admin: true,
      servidor,
      reconferir: rodar(true),
      corrigirAuto: rodar(false),
      corrigir: (id) => host.abrir({ tipo: "dfd", id, corrigirCenti: true }),
    };
  }, [host, grafo, confirmar, conhecidos, servidor]);
  return { acoes, confirmacao };
}
