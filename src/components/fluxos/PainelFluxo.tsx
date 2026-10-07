"use client";

import { useMemo } from "react";
import { campoVisivel, type Grafo, type Item, type NoFluxo, type PassoExec, type ResultadoExec } from "@/lib/fluxo-core";
import { corCategoria, REGISTRO_NOS } from "@/lib/fluxo-nos";
import { dataHoraBR } from "@/lib/format";
import { Badge, type Tone } from "../Badge";
import { Callout } from "../Callout";
import { type Column, DataTable } from "../DataTable";
import { Progress } from "../Progress";
import { StatMini } from "../StatMini";
import { IconeNo } from "./IconeNo";
import { CampoDoNo } from "./PainelNo";

const CARTAO = "rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring";

const ESTADO: Record<PassoExec["estado"], { rotulo: string; tom: Tone }> = {
  fila: { rotulo: "Na fila", tom: "slate" },
  rodando: { rotulo: "Executando", tom: "blue" },
  ok: { rotulo: "Concluído", tom: "emerald" },
  erro: { rotulo: "Falhou", tom: "red" },
  ignorado: { rotulo: "Pulado", tom: "slate" },
};

/** As etapas na ORDEM do fluxo (da esquerda para a direita, de cima para baixo), sem o Início. */
function etapasDoGrafo(g: Grafo): NoFluxo[] {
  return g.nos.filter((n) => n.tipo !== "gatilho.inicio").sort((a, b) => a.x - b.x || a.y - b.y);
}

const s = (v: unknown) => (v == null ? "" : String(v));

type Apontado = { nivel: string; mensagem: string; protocolo: string; dfd: string; planejamento: string };

/**
 * A TELA INICIAL de um fluxo (o diagrama só ao montar): os DADOS DE ENTRADA (os campos `entrada` dos componentes do
 * fluxo — o mesmo formulário do diagrama), as ETAPAS ao vivo (cada componente com o estado e os itens) e a ANÁLISE
 * (números + a tabela dos apontamentos, exportável). Tudo sai dos componentes do fluxo — nada é fixo por fluxo.
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
  const etapas = useMemo(() => etapasDoGrafo(grafo), [grafo]);
  const entradas = etapas
    .map((n) => {
      const def = REGISTRO_NOS.get(n.tipo);
      const campos = (def?.campos ?? []).filter((c) => c.entrada && campoVisivel(c, n.config));
      return def && campos.length && !n.desativado ? { n, def, campos } : null;
    })
    .filter((x) => !!x);
  const mudar = (no: NoFluxo, chave: string, v: unknown) =>
    onGrafo({ ...grafo, nos: grafo.nos.map((x) => (x.id === no.id ? { ...x, config: { ...x.config, [chave]: v } } : x)) });

  const feitas = etapas.filter((n) => ["ok", "erro", "ignorado"].includes(passos[n.id]?.estado ?? "")).length;
  const atual = etapas.find((n) => passos[n.id]?.estado === "rodando");

  const apontados = useMemo<Apontado[]>(
    () =>
      (resultado?.apontados ?? []).map((a) => {
        const it = (a.item && typeof a.item === "object" ? a.item : {}) as Item;
        const ano = s(it.ano);
        const prot = s(it.protocolo);
        return {
          nivel: s(a.nivel) === "atencao" ? "Atenção" : "Erro",
          mensagem: s(a.mensagem),
          protocolo: prot ? `${prot.split("/")[0]}${ano ? `/${ano}` : ""}` : "",
          dfd: s(it.numero),
          planejamento: s(it.planejamento),
        };
      }),
    [resultado],
  );
  const erros = apontados.filter((a) => a.nivel === "Erro").length;
  // O resultado dos componentes de SAÍDA (o 1º item de cada: ex. marcados · convergentes · divergentes).
  const saidas = etapas
    .filter((n) => REGISTRO_NOS.get(n.tipo)?.categoria === "saida" && passos[n.id]?.estado === "ok")
    .flatMap((n) => {
      const it = Object.values(passos[n.id]?.amostra ?? {})[0]?.[0];
      return it ? Object.entries(it).filter(([, v]) => typeof v === "number") : [];
    });
  const maiorEntrada = Math.max(0, ...etapas.filter((n) => ["centi", "sistema", "leitura"].includes(REGISTRO_NOS.get(n.tipo)?.categoria ?? "")).map((n) => passos[n.id]?.itens ?? 0));

  const colunas: Column<Apontado>[] = [
    {
      key: "nivel",
      header: "Nível",
      nowrap: true,
      value: (a) => a.nivel,
      render: (a) => <Badge tone={a.nivel === "Erro" ? "red" : "amber"} dot>{a.nivel}</Badge>,
    },
    { key: "protocolo", header: "Protocolo", nowrap: true, value: (a) => a.protocolo || "—", render: (a) => a.protocolo || "—" },
    { key: "planejamento", header: "Planej.", nowrap: true, value: (a) => a.planejamento || "—", render: (a) => a.planejamento || "—" },
    { key: "dfd", header: "DFD", nowrap: true, value: (a) => a.dfd || "—", render: (a) => a.dfd || "—" },
    { key: "mensagem", header: "Apontamento", align: "left", minWidth: 320, value: (a) => a.mensagem, render: (a) => <span className="whitespace-normal">{a.mensagem}</span> },
  ];

  const resumoUltima = ultima.resumo;
  return (
    <div className="grid gap-[var(--gap-block)] lg:grid-cols-[22rem_minmax(0,1fr)]">
      <div className="space-y-[var(--gap-block)]">
        <section className={CARTAO} aria-labelledby="fluxo-entradas">
          <h3 id="fluxo-entradas" className="mb-3 text-sm font-semibold text-text">
            Dados de entrada
          </h3>
          {entradas.length ? (
            <div className="space-y-4">
              {entradas.map(({ n, def, campos }) => (
                <fieldset key={n.id} className="space-y-2">
                  <legend className="mb-1 flex items-center gap-2 text-xs font-semibold text-muted">
                    <span className="flex size-5 items-center justify-center rounded text-white" style={{ background: corCategoria(def.categoria) }}>
                      <IconeNo nome={def.icone} className="size-3" />
                    </span>
                    {n.nome || def.rotulo}
                  </legend>
                  {campos.map((c) => (
                    <CampoDoNo key={c.chave} campo={c} valor={n.config[c.chave] ?? c.padrao} onValor={(v) => mudar(n, c.chave, v)} lista="" somenteLeitura={rodando} />
                  ))}
                </fieldset>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">Este fluxo não pede dados — é só executar.</p>
          )}
        </section>
        <section className={CARTAO} aria-labelledby="fluxo-etapas">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 id="fluxo-etapas" className="text-sm font-semibold text-text">
              Etapas
            </h3>
            <span className="text-xs text-muted tabular-nums">
              {feitas}/{etapas.length}
            </span>
          </div>
          {rodando && <Progress value={(feitas / Math.max(1, etapas.length)) * 100} label={atual ? (passos[atual.id]?.aviso ?? `${atual.nome || REGISTRO_NOS.get(atual.tipo)?.rotulo}…`) : "Executando…"} />}
          <ol className="mt-2 space-y-1.5">
            {etapas.map((n) => {
              const def = REGISTRO_NOS.get(n.tipo);
              const p = passos[n.id];
              const e = p ? ESTADO[p.estado] : null;
              return (
                <li key={n.id} className="flex items-start gap-2">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md text-white" style={{ background: def ? corCategoria(def.categoria) : "var(--muted)" }}>
                    <IconeNo nome={def?.icone ?? "alert"} className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[13px] text-text">{n.nome || def?.rotulo || n.tipo}</span>
                      {p && p.estado !== "fila" && <span className="text-xs text-muted tabular-nums">{p.itens} item(ns)</span>}
                      {e && <Badge tone={e.tom}>{e.rotulo}</Badge>}
                    </div>
                    {p?.estado === "erro" && <p className="text-xs text-[var(--danger)]">{p.erro}</p>}
                    {p?.estado === "rodando" && p.aviso && <p className="truncate text-xs text-muted">{p.aviso}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
      <section className={`${CARTAO} min-w-0 space-y-3`} aria-labelledby="fluxo-analise">
        <h3 id="fluxo-analise" className="text-sm font-semibold text-text">
          Análise
        </h3>
        {resultado ? (
          <>
            <Callout kind={resultado.estado === "concluido" ? (erros ? "warn" : "ok") : resultado.estado === "cancelado" ? "warn" : "danger"}>
              <strong className="block">{resultado.estado === "concluido" ? "Concluído" : resultado.estado === "cancelado" ? "Interrompido" : "Falhou"}</strong>
              {resultado.erro ?? `${dataHoraBR(resultado.fim)} · ${apontados.length} apontamento(s)`}
            </Callout>
            <div className="grid grid-cols-2 gap-[var(--gap-block)] sm:grid-cols-4">
              <StatMini label="Itens analisados" value={maiorEntrada.toLocaleString("pt-BR")} />
              <StatMini label="Erros" value={erros.toLocaleString("pt-BR")} tone={erros ? "danger" : "ok"} />
              <StatMini label="Atenções" value={(apontados.length - erros).toLocaleString("pt-BR")} tone={apontados.length - erros ? "warn" : "default"} />
              {saidas.slice(0, 1).map(([k, v]) => (
                <StatMini key={k} label={k.charAt(0).toUpperCase() + k.slice(1)} value={Number(v).toLocaleString("pt-BR")} tone="accent" />
              ))}
            </div>
            {saidas.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {saidas.slice(1).map(([k, v]) => (
                  <Badge key={k} tone="slate">
                    {k}: {Number(v).toLocaleString("pt-BR")}
                  </Badge>
                ))}
              </div>
            )}
            <DataTable
              columns={colunas}
              rows={apontados}
              getKey={(r) => apontados.indexOf(r)}
              density="compact"
              exportar={{ nome: "Apontamentos do fluxo" }}
              vazio="Nenhum apontamento — tudo conferido."
            />
          </>
        ) : rodando ? (
          <p className="text-sm text-muted">Executando — a análise aparece ao terminar.</p>
        ) : resumoUltima ? (
          <Callout kind={s(resumoUltima.estado) === "concluido" ? "info" : "warn"}>
            <strong className="block">Última execução{ultima.em ? ` · ${dataHoraBR(ultima.em)}` : ""}</strong>
            {s(resumoUltima.estado) === "concluido" ? "Concluída" : s(resumoUltima.estado) === "cancelado" ? "Interrompida" : `Falhou${resumoUltima.erro ? ` — ${s(resumoUltima.erro)}` : ""}`} ·{" "}
            {s(resumoUltima.apontados || 0)} apontamento(s). Execute de novo para ver o detalhe.
          </Callout>
        ) : (
          <p className="text-sm text-muted">Ajuste os dados de entrada e clique em Executar.</p>
        )}
      </section>
    </div>
  );
}
