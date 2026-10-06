"use client";

import { type MutableRefObject, useCallback, useEffect, useMemo, useState } from "react";
import { chaveOrgaoCenti } from "@/lib/automacao-centi-core";
import { chavePlanejamento, classeExecucao } from "@/lib/execucao-centi";
import { dataHoraBR } from "@/lib/format";
import { CelulaCopiavel } from "./BotaoCopiar";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { CelulaExecucao } from "./CelulaExecucao";
import { type Column, DataTable } from "./DataTable";
import { Segmented } from "./Segmented";
import { StatMini } from "./StatMini";
import { toast } from "./Toast";
import type { RespostaTela } from "./TarefaTelaProtocolo";

type Pedir = (acao: string, dados: unknown, ms: number) => Promise<RespostaTela & { colunas?: unknown; linhas?: unknown }>;
type Linha = {
  id: number;
  numero: string;
  planejamento: string;
  situacao: string | null;
  em: string | null;
  /** A chave do órgão do DFD (o mapa órgão → entidade da Centi). */
  orgao: string | null;
  orgaoNome: string;
  /** Depois de verificar: o planejamento apareceu na CM002 da entidade (undefined = ainda não verificado nesta sessão). */
  encontrado?: boolean;
};
type PlanCenti = { id: string; situacao: string; finalidade: string; centroCusto: string };
type SoNaCenti = PlanCenti & { entidade: string };
type Visao = "todos" | "diferentes" | "naoEncontrados" | "soCenti";
type DfdApi = {
  id: number;
  numero: string;
  planejamento: string | null;
  execucaoCenti: string | null;
  execucaoCentiEm: string | null;
  orgaoId: number | null;
  orgaoEntidade: string | null;
  orgaoNome: string | null;
};

/**
 * Tarefa "Verificar execução dos DFDs": pela API da Centi (sem mexer na tela), lê a lista INTEIRA da CM002 de cada ENTIDADE
 * cadastrada nos órgãos (ID = nº de planejamento) e grava a SITUAÇÃO em cada DFD daquele órgão. Separa os de situação
 * diferente de Executado, os não encontrados e os planejamentos que só existem na Centi. Só leitura na Centi.
 */
export function TarefaExecucaoDfds({
  pedir,
  lote,
  pronto,
  mapa,
  onRodando,
}: {
  pedir: Pedir;
  lote: MutableRefObject<string | null>;
  /** A extensão e a sessão da Centi prontas. */
  pronto: boolean;
  /** Órgão (chave) → entidade da Centi. */
  mapa: Record<string, string>;
  onRodando: (r: boolean) => void;
}) {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [rodando, setRodando] = useState(false);
  const [falha, setFalha] = useState<{ erro: string; diagnostico?: string } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [soNaCenti, setSoNaCenti] = useState<SoNaCenti[]>([]);
  const [visao, setVisao] = useState<Visao>("todos");
  useEffect(() => onRodando(rodando), [rodando, onRodando]);

  const carregar = useCallback(async () => {
    const r = (await fetch("/api/admin/automacao/execucao-dfds", { cache: "no-store" })
      .then((x) => x.json())
      .catch(() => null)) as { ok?: boolean; dfds?: DfdApi[] } | null;
    if (!r?.ok || !r.dfds) return;
    setLinhas(
      r.dfds
        .filter((d) => d.planejamento?.trim())
        .map((d) => ({
          id: d.id,
          numero: d.numero,
          planejamento: d.planejamento ?? "",
          situacao: d.execucaoCenti,
          em: d.execucaoCentiEm,
          orgao: chaveOrgaoCenti(d.orgaoId, d.orgaoEntidade),
          orgaoNome: d.orgaoNome ?? d.orgaoEntidade ?? "Sem órgão",
        })),
    );
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Os órgãos dos DFDs com a entidade ligada; os da entidade ABERTA são os verificados agora.
  const orgaos = useMemo(() => {
    const m = new Map<string, { chave: string; nome: string; dfds: number }>();
    for (const l of linhas) {
      if (!l.orgao) continue;
      const o = m.get(l.orgao) ?? { chave: l.orgao, nome: l.orgaoNome, dfds: 0 };
      o.dfds++;
      m.set(l.orgao, o);
    }
    return [...m.values()].sort((a, b) => b.dfds - a.dfds);
  }, [linhas]);
  // As entidades a ler: as dos órgãos dos DFDs (o ID cadastrado no órgão, ou o ligado no aparelho).
  const entidades = useMemo(() => {
    const m = new Map<string, Linha[]>();
    for (const l of linhas) {
      const e = l.orgao ? mapa[l.orgao] : undefined;
      if (!e) continue;
      const k = e.replace(/^0+(?=\d)/, "");
      m.set(k, [...(m.get(k) ?? []), l]);
    }
    return [...m.entries()].sort((a, b) => Number(a[0]) - Number(b[0]) || a[0].localeCompare(b[0]));
  }, [linhas, mapa]);

  // Tudo pela API (sem mexer na tela): para cada entidade, a lista INTEIRA da CM002 — a mesma consulta da tela, sem paginação.
  async function verificar() {
    if (rodando || !entidades.length) return;
    setRodando(true);
    setFalha(null);
    setAviso(null);
    const soCenti: SoNaCenti[] = [];
    const lidosPorEntidade: string[] = [];
    let atualizados = 0;
    try {
      const l = await pedir("lote", { fase: "inicio", titulo: "CM002 · Execução dos DFDs", total: entidades.length }, 8000);
      lote.current = l.loteId ?? null;
      for (const [i, [ent, dfds]] of entidades.entries()) {
        if (lote.current)
          await pedir("lote", { fase: "passo", loteId: lote.current, feito: i, total: entidades.length, texto: `Entidade ${ent}: lendo a CM002 (${dfds.length} DFD(s))` }, 8000);
        const r = (await pedir("cm002", { entidade: ent }, 300_000)) as RespostaTela & { linhas?: PlanCenti[]; semConsulta?: boolean };
        if (r.interrompido) break;
        if (!r.ok || !Array.isArray(r.linhas)) {
          setFalha({ erro: `Entidade ${ent}: ${r.erro ?? "a extensão não respondeu."}` });
          if (r.semConsulta) break;
          continue;
        }
        lidosPorEntidade.push(`${ent}: ${r.linhas.length}`);
        const doSistema = new Set(dfds.map((d) => chavePlanejamento(d.planejamento)));
        for (const p of r.linhas) if (!doSistema.has(chavePlanejamento(p.id))) soCenti.push({ ...p, entidade: ent });
        const g = (await fetch("/api/admin/automacao/execucao-dfds", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ colunas: ["ID", "SITUACAO"], linhas: r.linhas.map((p) => [p.id, p.situacao]), dfdIds: dfds.map((d) => d.id) }),
        })
          .then((x) => x.json())
          .catch(() => null)) as { ok?: boolean; error?: string; atualizados?: number; em?: string; linhas?: { id: number; situacao: string | null }[] } | null;
        if (!g?.ok || !g.linhas) {
          setFalha({ erro: `Entidade ${ent}: ${g?.error ?? "não consegui gravar a situação."}` });
          continue;
        }
        atualizados += g.atualizados ?? 0;
        const novo = new Map(g.linhas.map((x) => [x.id, x.situacao]));
        setLinhas((ls) => ls.map((x) => (novo.has(x.id) ? { ...x, situacao: novo.get(x.id) ?? null, em: g.em ?? x.em, encontrado: !!novo.get(x.id) } : x)));
      }
      if (lote.current) await pedir("lote", { fase: "fim", loteId: lote.current, resumo: `${lidosPorEntidade.length} entidade(s) lidas` }, 8000);
      setSoNaCenti(soCenti);
      if (lidosPorEntidade.length) {
        setAviso(`Lido pela API — planejamentos por entidade: ${lidosPorEntidade.join(" · ")}.`);
        toast.success(`${atualizados} DFD(s) atualizado(s).`);
      }
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
      render: (l) => (
        <CelulaCopiavel copiar={l.planejamento} rotulo="nº de planejamento">
          {l.planejamento}
        </CelulaCopiavel>
      ),
    },
    {
      key: "dfd",
      header: "Nº DFD",
      nowrap: true,
      value: (l) => l.numero,
      render: (l) => (
        <CelulaCopiavel copiar={l.numero} rotulo="nº do DFD">
          {l.numero}
        </CelulaCopiavel>
      ),
    },
    { key: "orgao", header: "Órgão", value: (l) => l.orgaoNome, render: (l) => <span className="text-[12px]">{l.orgaoNome}</span> },
    {
      key: "entidade",
      header: "Entidade (Centi)",
      nowrap: true,
      value: (l) => (l.orgao && mapa[l.orgao]) || "Não ligada",
      render: (l) => <span className="font-mono text-[12px]">{(l.orgao && mapa[l.orgao]) || "—"}</span>,
    },
    {
      key: "situacao",
      header: "Execução (Centi)",
      nowrap: true,
      value: (l) => l.situacao ?? "Não verificado",
      render: (l) => <CelulaExecucao situacao={l.situacao} />,
    },
    {
      key: "em",
      header: "Verificado em",
      nowrap: true,
      filter: "none",
      value: (l) => l.em ?? "",
      render: (l) => <span className="text-[12px] text-muted">{l.em ? dataHoraBR(l.em) : "—"}</span>,
    },
  ];

  const semLigacao = orgaos.filter((o) => !mapa[o.chave]);

  const verificados = linhas.filter((l) => l.situacao);
  const diferentes = linhas.filter((l) => l.situacao && classeExecucao(l.situacao) !== "executado");
  const naoEncontrados = linhas.filter((l) => l.encontrado === false);
  const semEntidade = linhas.filter((l) => !(l.orgao && mapa[l.orgao]));
  const linhasVisao = visao === "diferentes" ? diferentes : visao === "naoEncontrados" ? naoEncontrados : linhas;
  const colunasCenti: Column<SoNaCenti>[] = [
    { key: "id", header: "ID (Plan.)", nowrap: true, value: (p) => p.id, render: (p) => <CelulaCopiavel copiar={p.id} rotulo="nº de planejamento">{p.id}</CelulaCopiavel> },
    { key: "ent", header: "Entidade", nowrap: true, value: (p) => p.entidade, render: (p) => <span className="font-mono text-[12px]">{p.entidade}</span> },
    { key: "sit", header: "Situação (Centi)", nowrap: true, value: (p) => p.situacao || "—", render: (p) => <CelulaExecucao situacao={p.situacao || null} /> },
    { key: "cc", header: "Centro de custo", value: (p) => p.centroCusto, render: (p) => <span className="text-[12px]">{p.centroCusto || "—"}</span> },
    { key: "fin", header: "Finalidade", value: (p) => p.finalidade, render: (p) => <span className="text-[12px]">{p.finalidade || "—"}</span> },
  ];

  return (
    <div className="flex min-h-0 flex-col gap-[var(--gap-block)]">
      <div className="flex flex-wrap items-center gap-2">
        <StatMini label="Executados" value={String(conta.executado)} tone="ok" />
        <StatMini label="Situação diferente" value={String(diferentes.length)} tone={diferentes.length ? "danger" : undefined} />
        <StatMini label="Não encontrados" value={String(naoEncontrados.length)} tone={naoEncontrados.length ? "warn" : undefined} />
        <StatMini label="Não verificados" value={String(linhas.length - verificados.length)} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-muted">
            {entidades.length} entidade(s) · {linhas.length - semEntidade.length} DFD(s) com entidade
          </span>
          <Button size="sm" onClick={verificar} loading={rodando} disabled={!pronto || !entidades.length}>
            Verificar tudo na Centi (CM002)
          </Button>
        </div>
      </div>
      {semEntidade.length > 0 && (
        <Callout kind="warn">
          {semEntidade.length} DFD(s) de órgão sem o “ID da entidade na Centi” ficam fora: {orgaos.filter((o) => !mapa[o.chave]).map((o) => `${o.nome} (${o.dfds})`).slice(0, 8).join(", ")}
          {semLigacao.length > 8 ? ` e mais ${semLigacao.length - 8}` : ""}. Cadastre em Órgãos e Unidades.
        </Callout>
      )}
      {aviso && <Callout kind="info">{aviso}</Callout>}
      {falha && (
        <Callout kind="danger">
          {falha.erro}
          {falha.diagnostico && <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-[11px]">{falha.diagnostico}</pre>}
        </Callout>
      )}
      <Segmented
        ariaLabel="Visão da execução"
        value={visao}
        onChange={(v) => setVisao(v as Visao)}
        options={[
          { value: "todos", label: `DFDs do sistema (${linhas.length})` },
          { value: "diferentes", label: `Situação diferente (${diferentes.length})` },
          { value: "naoEncontrados", label: `Não encontrados na Centi (${naoEncontrados.length})` },
          { value: "soCenti", label: `Só na Centi (${soNaCenti.length})` },
        ]}
      />
      <div key={visao} className="min-h-0 flex-1 animate-cat-morph">
        {visao === "soCenti" ? (
          <DataTable
            columns={colunasCenti}
            rows={soNaCenti}
            getKey={(p) => `${p.entidade}:${p.id}`}
            density="compact"
            scrollInterno
            exportar={{ nome: "Planejamentos só na Centi" }}
            vazio="Nenhum planejamento da Centi sem DFD no sistema (verifique primeiro)."
            resumo={(ls) => `${ls.length} planejamento(s)`}
          />
        ) : (
          <DataTable
            columns={colunas}
            rows={linhasVisao}
            getKey={(l) => l.id}
            density="compact"
            scrollInterno
            exportar={{ nome: "Execução dos DFDs (Centi)" }}
            vazio={visao === "todos" ? "Nenhum DFD com nº de planejamento no sistema." : "Nada aqui."}
            resumo={(ls) => `${ls.length} DFD(s)`}
          />
        )}
      </div>
    </div>
  );
}
