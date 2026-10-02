"use client";

import { type MutableRefObject, useEffect, useMemo, useState } from "react";
import type { ProtocoloAutomacao } from "@/lib/automacao-centi-core";
import { concluirPassos, iniciarExecucaoLeitura } from "@/lib/automacao-cliente";
import {
  departamentosEscolhidosValidos,
  normalizarProtocolosTela,
  noSistemaTela,
  type ProtocoloEmAnalise,
} from "@/lib/automacao-tela-protocolo";
import { Badge } from "./Badge";
import { CelulaCopiavel } from "./BotaoCopiar";
import { Button } from "./Button";
import { type Column, DataTable } from "./DataTable";
import { Checkbox } from "./Field";
import { toast } from "./Toast";

/** A resposta da extensão (o pedido à aba da Centi). */
export type RespostaTela = {
  ok: boolean;
  erro?: string;
  departamentos?: string[];
  protocolos?: unknown[];
  total?: number;
  interrompido?: boolean;
  loteId?: string;
};
type Pedir = (acao: string, dados: unknown, ms: number) => Promise<RespostaTela>;

const CHAVE_ESCOLHA = "automacao:tela-departamentos";
const CARTAO = "rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring";

function lerEscolha(): unknown {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_ESCOLHA) ?? "null");
  } catch {
    return null;
  }
}
function gravarEscolha(v: string[]) {
  try {
    localStorage.setItem(CHAVE_ESCOLHA, JSON.stringify(v));
  } catch {}
}

/**
 * Tarefa "LER A TELA PROTOCOLO" (só leitura na Centi): a extensão entra na PO011 da aba "Automação PCA" pela própria
 * interface, devolve as REPARTIÇÕES do seletor Departamentos; o ADM escolhe; a extensão as seleciona, pesquisa, abre a aba
 * "Em Análise" e devolve os protocolos; o ADM marca quais tratar (o tratamento chega numa próxima entrega).
 */
export function TarefaTelaProtocolo({
  pedir,
  lote,
  pronto,
  protocolos,
  onRodando,
}: {
  pedir: Pedir;
  lote: MutableRefObject<string | null>;
  /** A extensão atualizada e a Centi logada. */
  pronto: boolean;
  /** Os protocolos do sistema (a coluna "No sistema"). */
  protocolos: ProtocoloAutomacao[];
  onRodando: (v: boolean) => void;
}) {
  const [deps, setDeps] = useState<string[] | null>(null);
  const [escolha, setEscolha] = useState<string[]>([]);
  const [lidos, setLidos] = useState<{ protocolos: ProtocoloEmAnalise[]; total: number; reparticoes: string[] } | null>(null);
  const [sel, setSel] = useState<Set<string | number>>(new Set());
  const [ocupado, setOcupado] = useState<"deps" | "ler" | null>(null);
  useEffect(() => onRodando(ocupado !== null), [ocupado, onRodando]);

  /** Um lote curto na extensão (o cartão, a moldura e o título da aba da automação mostram o passo). */
  async function comLote<T>(titulo: string, passo: string, fn: () => Promise<T>, resumo: (r: T) => string): Promise<T> {
    const l = await pedir("lote", { fase: "inicio", titulo, total: 1 }, 8000);
    lote.current = l.loteId ?? null;
    await pedir("lote", { fase: "passo", loteId: lote.current, feito: 0, total: 1, texto: passo }, 8000);
    try {
      const r = await fn();
      if (lote.current) await pedir("lote", { fase: "fim", loteId: lote.current, resumo: resumo(r) }, 8000);
      return r;
    } finally {
      lote.current = null;
    }
  }

  async function buscarReparticoes() {
    if (ocupado) return;
    setOcupado("deps");
    try {
      const r = await comLote("Tela Protocolo", "Lendo as repartições (Departamentos)", () => pedir("telaDepartamentos", null, 90_000), (x) =>
        x.ok ? `${x.departamentos?.length ?? 0} repartição(ões)` : (x.erro ?? "Falhou"),
      );
      if (!r.ok) return void toast.error(r.erro ?? "A extensão não respondeu.", 12000);
      const lista = (r.departamentos ?? []).filter((d): d is string => typeof d === "string" && !!d.trim()).slice(0, 200);
      setDeps(lista);
      setEscolha(departamentosEscolhidosValidos(lerEscolha(), lista));
      if (!lista.length) toast.warning("A Centi não mostrou nenhuma repartição no seletor Departamentos.");
    } finally {
      setOcupado(null);
    }
  }

  function definirEscolha(n: string[]) {
    setEscolha(n);
    gravarEscolha(n);
  }

  function alternar(d: string) {
    setEscolha((e) => {
      const n = e.includes(d) ? e.filter((x) => x !== d) : [...e, d];
      gravarEscolha(n);
      return n;
    });
  }

  async function lerEmAnalise() {
    if (ocupado || !escolha.length) return;
    setOcupado("ler");
    setSel(new Set());
    try {
      const reparticoes = [...escolha];
      const ex = await iniciarExecucaoLeitura("protocolos-por-reparticao", "consultar", [{ chave: "em-analise", alvo: reparticoes.join("; ") }], {
        reparticoes: reparticoes.length,
      });
      const r = await comLote(
        "Tela Protocolo · Em Análise",
        `Lendo “Em Análise” de ${reparticoes.length} repartição(ões)`,
        () => pedir("telaEmAnalise", { departamentos: reparticoes }, 180_000),
        (x) => (x.ok ? `${x.protocolos?.length ?? 0} protocolo(s) em análise` : (x.erro ?? "Falhou")),
      );
      if ("id" in ex)
        await concluirPassos(ex.id, [
          { chave: "em-analise", estado: r.ok ? "ok" : "falhou", texto: r.ok ? `${r.protocolos?.length ?? 0} protocolo(s)` : (r.erro ?? "Falhou") },
        ]);
      if (!r.ok) return void toast.error(r.erro ?? "A extensão não respondeu.", 12000);
      const ps = normalizarProtocolosTela(r.protocolos);
      setLidos({ protocolos: ps, total: typeof r.total === "number" ? r.total : ps.length, reparticoes });
      if (typeof r.total === "number" && r.total > ps.length) toast.warning(`A Centi indica ${r.total} protocolo(s), mas só ${ps.length} foram lidos.`, 10000);
      else toast.success(`${ps.length} protocolo(s) em análise.`);
    } finally {
      setOcupado(null);
    }
  }

  const casar = useMemo(() => noSistemaTela(protocolos), [protocolos]);
  const colunas = useMemo<Column<ProtocoloEmAnalise>[]>(
    () => [
      {
        key: "protocolo",
        header: "Protocolo",
        nowrap: true,
        value: (p) => p.protocolo,
        render: (p) => (
          <CelulaCopiavel copiar={p.protocolo} rotulo="nº do protocolo">
            {p.protocolo}
          </CelulaCopiavel>
        ),
      },
      { key: "ano", header: "Ano", nowrap: true, value: (p) => p.ano, render: (p) => p.ano || "—" },
      { key: "departamento", header: "Departamento", value: (p) => p.departamento, render: (p) => p.departamento || "—" },
      { key: "interessado", header: "Interessado", value: (p) => p.interessado, render: (p) => p.interessado || "—" },
      { key: "solicitante", header: "Solicitante", value: (p) => p.solicitante, render: (p) => p.solicitante || "—" },
      { key: "natureza", header: "Natureza", value: (p) => p.natureza, render: (p) => p.natureza || "—" },
      {
        key: "sistema",
        header: "No sistema",
        nowrap: true,
        value: (p) => (casar(p) ? "No sistema" : "Novo"),
        render: (p) =>
          casar(p) ? (
            <Badge tone="emerald" dot>
              No sistema
            </Badge>
          ) : (
            <Badge tone="slate">Novo</Badge>
          ),
      },
    ],
    [casar],
  );

  const todas = !!deps?.length && escolha.length === deps.length;
  return (
    <div className="flex min-h-0 flex-col gap-[var(--gap-block)] xl:h-full">
      <section className={`${CARTAO} space-y-3`}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-bold text-text">1 · Repartições</h2>
          <span className="text-xs text-muted">{deps ? `${escolha.length} de ${deps.length} escolhida(s)` : "da Tela Protocolo (PO011) da Centi"}</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {deps && deps.length > 1 && (
              <Button size="sm" variant="ghost" onClick={() => definirEscolha(todas ? [] : deps)}>
                {todas ? "Nenhuma" : "Todas"}
              </Button>
            )}
            <Button size="sm" variant={deps ? "secondary" : "primary"} onClick={() => void buscarReparticoes()} loading={ocupado === "deps"} disabled={!pronto || !!ocupado}>
              {deps ? "Buscar de novo" : "Buscar repartições"}
            </Button>
          </div>
        </div>
        {deps && (
          <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2 xl:grid-cols-4">
            {deps.map((d) => (
              <Checkbox key={d} label={d} checked={escolha.includes(d)} onChange={() => alternar(d)} disabled={!!ocupado} />
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <h2 className="text-sm font-bold text-text">2 · Em Análise</h2>
          <span className="text-xs text-muted">
            {lidos ? `${lidos.protocolos.length} protocolo(s) · ${lidos.reparticoes.length} repartição(ões)` : "a extensão escolhe as repartições, pesquisa e lê a aba"}
          </span>
          <Button size="sm" className="ml-auto" onClick={() => void lerEmAnalise()} loading={ocupado === "ler"} disabled={!pronto || !!ocupado || !escolha.length}>
            Ler “Em Análise”
          </Button>
        </div>
      </section>
      <div className="min-h-0 min-w-0 flex-1">
        <DataTable
          columns={colunas}
          rows={lidos?.protocolos ?? []}
          getKey={(p) => p.chave}
          selectable
          selected={sel}
          onSelected={setSel}
          density="compact"
          scrollInterno
          exportar={{ nome: "Em Análise" }}
          acoesRodape={
            <Button size="sm" disabled title="Disponível na próxima entrega">
              Tratar selecionados ({sel.size})
            </Button>
          }
          vazio={lidos ? "Nenhum protocolo em análise nas repartições escolhidas." : "Escolha as repartições e toque em “Ler Em Análise”."}
          resumo={(ls) => `${ls.length} protocolo(s) · ${ls.filter((p) => casar(p)).length} no sistema`}
        />
      </div>
    </div>
  );
}
