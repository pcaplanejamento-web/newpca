"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { num } from "@/lib/format";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import type { DadosQuadro } from "@/lib/tarefas-dados";
import {
  cartoesDaLista,
  FILTRO_TAREFAS_PADRAO,
  type FiltroTarefas,
  filtrarTarefas,
  moverCartao,
  prefixoEdicoesTarefas,
  resumoQuadro,
  vizinhos,
} from "@/lib/tarefas-core";
import { AbasEspaco, FerramentasAba } from "./AbasEspaco";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { ConfiguracaoQuadro } from "./ConfiguracaoQuadro";
import type { EdicoesDaTabela } from "./DataTable";
import { FiltrosTarefas } from "./FiltrosTarefas";
import { IconChevronLeft, IconPlus } from "./icons";
import { QuadroKanban } from "./QuadroKanban";
import { Segmented } from "./Segmented";
import { TabelaTarefas } from "./TabelaTarefas";
import { type AberturaTarefa, TarefaDetalhe } from "./TarefaDetalhe";
import { toast } from "./Toast";

export type AbaQuadro = "quadro" | "lista" | "configuracao";

/**
 * ESPAÇO DE UM QUADRO de tarefas (`/painel/tarefas/[id]`): UMA linha de cabeçalho (voltar · cor · nome · grupo · abertas ·
 * atrasadas · concluídas) e as abas **Quadro · Lista · Configuração** (`AbasEspaco`), com os FILTROS e "Nova tarefa" na
 * mesma linha (`FerramentasAba`). Os cartões ficam num estado LOCAL (arrastar é otimista — a ordem gravada volta com o
 * `router.refresh`); o filtro segue de uma aba para a outra.
 */
export function QuadroTarefas({
  aba,
  quadro,
  listas,
  tarefas: doServidor,
  etiquetas,
  membros,
  pessoas,
  edicoes,
  hoje,
  podeEditar,
  usuarioId,
}: DadosQuadro & { aba: AbaQuadro; usuarioId: number }) {
  const router = useRouter();
  const [tarefas, setTarefas] = useState(doServidor);
  useEffect(() => setTarefas(doServidor), [doServidor]);
  const [filtro, setFiltro] = useState<FiltroTarefas>(FILTRO_TAREFAS_PADRAO);
  const [arquivadas, setArquivadas] = useState(false);
  const [aberto, setAberto] = useState<AberturaTarefa | null>(null);
  const [ed, setEd] = useState(edicoes);

  const ativas = useMemo(() => listas.filter((l) => !l.arquivada), [listas]);
  const doGrupo = useMemo(() => {
    const m = new Set(membros);
    return pessoas.filter((p) => m.has(p.id));
  }, [membros, pessoas]);
  const resumo = resumoQuadro(tarefas, hoje);
  const listasAtivas = useMemo(() => new Set(ativas.map((l) => l.id)), [ativas]);
  const filtradas = useMemo(() => filtrarTarefas(tarefas, filtro, { usuarioId, hoje }), [tarefas, filtro, usuarioId, hoje]);
  const noQuadro = useMemo(() => filtradas.filter((t) => !t.arquivada && listasAtivas.has(t.listaId)), [filtradas, listasAtivas]);
  const naLista = useMemo(() => filtradas.filter((t) => t.arquivada === arquivadas), [filtradas, arquivadas]);

  const mover = async (id: number, listaId: number, indice: number) => {
    const antes = tarefas;
    const t = antes.find((x) => x.id === id);
    if (!t) return;
    const lista = cartoesDaLista(antes, listaId).filter((x) => x.id !== id);
    const pos = Math.max(0, Math.min(indice, lista.length));
    if (listaId === t.listaId && pos === cartoesDaLista(antes, listaId).findIndex((x) => x.id === id)) return; // mesmo lugar
    const viz = vizinhos(antes, id, listaId, pos);
    setTarefas(moverCartao(antes, listas, id, listaId, pos, new Date().toISOString()));
    try {
      const r = await chamar<{ ordens: [number, number][] }>(`/api/tarefas/${id}/mover`, "POST", { listaId, ...viz });
      if (r.ordens.length) router.refresh(); // a lista foi renumerada no servidor
    } catch (e) {
      setTarefas(antes);
      toast.error((e as Error).message);
    }
  };

  const criar = async (listaId: number, titulo: string) => {
    try {
      await chamar("/api/tarefas", "POST", { quadroId: quadro.id, listaId, titulo });
      router.refresh();
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    }
  };

  const edicoesLista: EdicoesDaTabela = {
    chave: `${prefixoEdicoesTarefas(quadro.id)}lista`,
    lista: ed.lista,
    padroes: ed.padroes,
    onMudar: (lista, padroes) => setEd({ lista, padroes }),
  };

  const indicadores = [
    { rotulo: "Abertas", valor: num(resumo.abertas) },
    { rotulo: "Atrasadas", valor: num(resumo.atrasadas), cor: resumo.atrasadas ? "var(--danger)" : undefined },
    { rotulo: "Concluídas", valor: num(resumo.concluidas) },
  ];
  const semListas = ativas.length === 0;

  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href="/painel/tarefas"
            aria-label="Voltar para Tarefas"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-control text-muted transition-colors hover:bg-surface-2 hover:text-text lg:h-[var(--h-control-sm)] lg:w-[var(--h-control-sm)]"
          >
            <IconChevronLeft className="h-4 w-4" />
          </Link>
          <span aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={{ background: quadro.cor }} />
          <h1 className="min-w-0 truncate text-lg font-bold text-text" title={quadro.nome}>
            {quadro.nome}
          </h1>
          <Badge>{quadro.grupoNome}</Badge>
          {quadro.arquivado && <Badge tone="amber">Arquivado</Badge>}
        </div>
        <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          {indicadores.map((i) => (
            <div key={i.rotulo} className="flex items-baseline gap-1.5">
              <dt className="text-muted">{i.rotulo}</dt>
              <dd className="font-semibold tabular-nums text-text" style={i.cor ? { color: i.cor } : undefined}>
                {i.valor}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <AbasEspaco<AbaQuadro>
        aba={aba}
        opcoes={[
          { value: "quadro", label: "Quadro" },
          { value: "lista", label: "Lista" },
          { value: "configuracao", label: "Configuração" },
        ]}
      >
        {aba !== "configuracao" && (
          <FerramentasAba>
            {aba === "lista" && (
              <Segmented<"ativas" | "arquivadas">
                ariaLabel="Tarefas ativas ou arquivadas"
                value={arquivadas ? "arquivadas" : "ativas"}
                onChange={(v) => setArquivadas(v === "arquivadas")}
                options={[
                  { value: "ativas", label: "Ativas" },
                  { value: "arquivadas", label: "Arquivadas" },
                ]}
              />
            )}
            <FiltrosTarefas filtro={filtro} onChange={setFiltro} pessoas={pessoas} etiquetas={etiquetas} usuarioId={usuarioId} />
            <Button size="sm" variant="accent" disabled={semListas} icon={<IconPlus className="h-4 w-4" />} onClick={() => setAberto({ tipo: "nova", listaId: ativas[0].id })}>
              <span className="max-sm:sr-only">Nova tarefa</span>
            </Button>
          </FerramentasAba>
        )}
        {aba === "quadro" ? (
          semListas ? (
            <p className="rounded-card border border-dashed border-border-2 bg-surface px-6 py-12 text-center text-sm text-muted">
              Nenhuma lista ativa — crie uma na Configuração do quadro.
            </p>
          ) : (
            <QuadroKanban
              listas={ativas}
              tarefas={noQuadro}
              etiquetas={etiquetas}
              pessoas={pessoas}
              hoje={hoje}
              onAbrir={(id) => setAberto({ tipo: "editar", id })}
              onMover={mover}
              onCriar={criar}
            />
          )
        ) : aba === "lista" ? (
          <TabelaTarefas
            tarefas={naLista}
            listas={listas}
            etiquetas={etiquetas}
            pessoas={pessoas}
            hoje={hoje}
            ativa={aberto?.tipo === "editar" ? aberto.id : null}
            onAbrir={(id) => setAberto({ tipo: "editar", id })}
            edicoes={edicoesLista}
          />
        ) : (
          <ConfiguracaoQuadro quadro={quadro} listas={listas} etiquetas={etiquetas} podeEditar={podeEditar} onMudou={() => router.refresh()} />
        )}
      </AbasEspaco>

      <TarefaDetalhe
        aberto={aberto}
        quadroId={quadro.id}
        tarefas={tarefas}
        listas={ativas}
        etiquetas={etiquetas}
        pessoas={doGrupo}
        todas={pessoas}
        hoje={hoje}
        usuarioId={usuarioId}
        podeExcluir={podeEditar}
        onFechar={() => setAberto(null)}
        onSalvo={() => router.refresh()}
      />
    </div>
  );
}
