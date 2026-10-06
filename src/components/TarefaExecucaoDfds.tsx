"use client";

import { type MutableRefObject, useCallback, useEffect, useMemo, useState } from "react";
import { classeExecucao } from "@/lib/execucao-centi";
import { dataHoraBR } from "@/lib/format";
import { CelulaExecucao } from "./CelulaExecucao";
import { Button } from "./Button";
import { CelulaCopiavel } from "./BotaoCopiar";
import { Callout } from "./Callout";
import { type Column, DataTable } from "./DataTable";
import { StatMini } from "./StatMini";
import { toast } from "./Toast";
import type { RespostaTela } from "./TarefaTelaProtocolo";

type Pedir = (acao: string, dados: unknown, ms: number) => Promise<RespostaTela & { colunas?: unknown; linhas?: unknown }>;
type Linha = { id: number; numero: string; planejamento: string; situacao: string | null; antes?: string | null; em?: string | null };
type DfdApi = { id: number; numero: string; planejamento: string | null; execucaoCenti: string | null; execucaoCentiEm: string | null };

/**
 * Tarefa "Verificar execução dos DFDs": lê a SITUAÇÃO de cada planejamento na tela CM002 da Centi (ID = nº de planejamento)
 * e grava em cada DFD do sistema. Só leitura na Centi.
 */
export function TarefaExecucaoDfds({
  pedir,
  lote,
  pronto,
  onRodando,
}: {
  pedir: Pedir;
  lote: MutableRefObject<string | null>;
  /** A extensão e a sessão da Centi prontas. */
  pronto: boolean;
  onRodando: (r: boolean) => void;
}) {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [rodando, setRodando] = useState(false);
  const [falha, setFalha] = useState<{ erro: string; diagnostico?: string } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  useEffect(() => onRodando(rodando), [rodando, onRodando]);

  const carregar = useCallback(async () => {
    const r = (await fetch("/api/admin/automacao/execucao-dfds", { cache: "no-store" })
      .then((x) => x.json())
      .catch(() => null)) as { ok?: boolean; dfds?: DfdApi[] } | null;
    if (!r?.ok || !r.dfds) return;
    setLinhas(
      r.dfds
        .filter((d) => d.planejamento?.trim())
        .map((d) => ({ id: d.id, numero: d.numero, planejamento: d.planejamento ?? "", situacao: d.execucaoCenti, em: d.execucaoCentiEm })),
    );
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function verificar() {
    if (rodando) return;
    setRodando(true);
    setFalha(null);
    setAviso(null);
    try {
      const ids = [...new Set(linhas.map((l) => l.planejamento.replace(/\D/g, "").replace(/^0+/, "")).filter(Boolean))];
      const l = await pedir("lote", { fase: "inicio", titulo: "CM002 · Execução dos DFDs", total: 1 }, 8000);
      lote.current = l.loteId ?? null;
      await pedir("lote", { fase: "passo", loteId: lote.current, feito: 0, total: 1, texto: "Lendo a situação dos planejamentos (CM002)" }, 8000);
      const r = await pedir("telaPlanejamentos", { ids }, 600_000);
      if (lote.current) await pedir("lote", { fase: "fim", loteId: lote.current, resumo: r.ok ? `${Array.isArray(r.linhas) ? r.linhas.length : 0} planejamento(s)` : (r.erro ?? "Falhou") }, 8000);
      if (!r.ok) {
        setFalha({ erro: r.erro ?? "A extensão não respondeu.", diagnostico: typeof r.diagnostico === "string" ? r.diagnostico : undefined });
        toast.error(r.erro ?? "A extensão não respondeu.", 12000);
        return;
      }
      const g = (await fetch("/api/admin/automacao/execucao-dfds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ colunas: r.colunas, linhas: r.linhas }),
      })
        .then((x) => x.json())
        .catch(() => null)) as { ok?: boolean; error?: string; lidos?: number; atualizados?: number; em?: string; linhas?: Linha[] } | null;
      if (!g?.ok || !g.linhas) {
        toast.error(g?.error ?? "Não consegui gravar a situação dos DFDs.");
        return;
      }
      setLinhas(g.linhas.map((x) => ({ ...x, em: x.situacao ? g.em : null })));
      const nao = g.linhas.filter((x) => !x.situacao).length;
      const total = typeof r.total === "number" ? r.total : null;
      if (total && Array.isArray(r.linhas) && r.linhas.length < total)
        setAviso(`A Centi indica ${total} planejamento(s), mas só ${r.linhas.length} foram lidos — ${nao} DFD(s) ficaram sem situação.`);
      else if (nao) setAviso(`${nao} DFD(s) com nº de planejamento que não aparece na CM002.`);
      toast.success(`${g.lidos} planejamento(s) lidos · ${g.atualizados} DFD(s) atualizado(s).`);
    } finally {
      lote.current = null;
      setRodando(false);
    }
  }

  const conta = useMemo(() => {
    const c = { executado: 0, cancelado: 0, outro: 0, sem: 0 };
    for (const l of linhas) c[classeExecucao(l.situacao) ?? "sem"]++;
    return c;
  }, [linhas]);

  const colunas: Column<Linha>[] = [
    {
      key: "planejamento",
      header: "Nº Plan.",
      nowrap: true,
      value: (l) => l.planejamento,
      render: (l) => <CelulaCopiavel copiar={l.planejamento} rotulo="nº de planejamento">{l.planejamento}</CelulaCopiavel>,
    },
    { key: "dfd", header: "Nº DFD", nowrap: true, value: (l) => l.numero, render: (l) => <CelulaCopiavel copiar={l.numero} rotulo="nº do DFD">{l.numero}</CelulaCopiavel> },
    {
      key: "situacao",
      header: "Execução (Centi)",
      nowrap: true,
      value: (l) => l.situacao ?? "Não verificado",
      render: (l) => <CelulaExecucao situacao={l.situacao} />,
    },
    { key: "em", header: "Verificado em", nowrap: true, filter: "none", value: (l) => l.em ?? "", render: (l) => <span className="text-[12px] text-muted">{l.em ? dataHoraBR(l.em) : "—"}</span> },
  ];

  return (
    <div className="flex min-h-0 flex-col gap-[var(--gap-block)]">
      <div className="flex flex-wrap items-center gap-2">
        <StatMini label="Executados" value={String(conta.executado)} tone="ok" />
        <StatMini label="Cancelados" value={String(conta.cancelado)} tone="danger" />
        <StatMini label="Outra situação" value={String(conta.outro)} tone="warn" />
        <StatMini label="Não verificados" value={String(conta.sem)} />
        <div className="ml-auto">
          <Button size="sm" onClick={verificar} loading={rodando} disabled={!pronto || !linhas.length}>
            Verificar na Centi (CM002)
          </Button>
        </div>
      </div>
      {aviso && <Callout kind="warn">{aviso}</Callout>}
      {falha && (
        <Callout kind="danger">
          {falha.erro}
          {falha.diagnostico && <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-[11px]">{falha.diagnostico}</pre>}
        </Callout>
      )}
      <div className="min-h-0 flex-1">
        <DataTable
          columns={colunas}
          rows={linhas}
          getKey={(l) => l.id}
          density="compact"
          scrollInterno
          exportar={{ nome: "Execução dos DFDs (Centi)" }}
          vazio="Nenhum DFD com nº de planejamento no sistema."
          resumo={(ls) => `${ls.length} DFD(s)`}
        />
      </div>
    </div>
  );
}
