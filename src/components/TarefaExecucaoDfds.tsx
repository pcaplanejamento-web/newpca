"use client";

import { type MutableRefObject, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { chaveOrgaoCenti } from "@/lib/automacao-centi-core";
import { chavePlanejamento, classeExecucao } from "@/lib/execucao-centi";
import { dataHoraBR } from "@/lib/format";
import { CelulaCopiavel } from "./BotaoCopiar";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { CelulaExecucao } from "./CelulaExecucao";
import { type Column, DataTable } from "./DataTable";
import { IconChevronDown, IconClose } from "./icons";
import { Progress } from "./Progress";
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
type ResumoEntidade = { entidade: string; orgaos: string; dfds: number; lidos: number; diferentes: number; soCenti: number; erro?: string };
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
  const [falha, setFalha] = useState<{ erro: string } | null>(null);
  const [soNaCenti, setSoNaCenti] = useState<SoNaCenti[]>([]);
  const [visao, setVisao] = useState<Visao>("todos");
  const [progresso, setProgresso] = useState<{ feito: number; total: number; texto: string } | null>(null);
  const [porEntidade, setPorEntidade] = useState<ResumoEntidade[]>([]);
  const [painel, setPainel] = useState<"aberto" | "recolhido" | "fechado">("fechado");
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
    const soCenti: SoNaCenti[] = [];
    const lidosPorEntidade: string[] = [];
    const erros: string[] = [];
    const resumo: ResumoEntidade[] = [];
    setPorEntidade([]);
    setPainel("aberto");
    let atualizados = 0;
    try {
      const l = await pedir("lote", { fase: "inicio", titulo: "CM002 · Execução dos DFDs", total: entidades.length }, 8000);
      lote.current = l.loteId ?? null;
      for (const [i, [ent, dfds]] of entidades.entries()) {
        const texto = `Entidade ${ent} (${i + 1} de ${entidades.length}) · lendo a CM002 · ${dfds.length} DFD(s)`;
        setProgresso({ feito: i, total: entidades.length, texto });
        const item: ResumoEntidade = { entidade: ent, orgaos: [...new Set(dfds.map((d) => d.orgaoNome))].join(", "), dfds: dfds.length, lidos: 0, diferentes: 0, soCenti: 0 };
        resumo.push(item);
        if (lote.current) await pedir("lote", { fase: "passo", loteId: lote.current, feito: i, total: entidades.length, texto }, 8000);
        let r = (await pedir("cm002", { entidade: ent }, 300_000)) as RespostaTela & { linhas?: PlanCenti[]; semConsulta?: boolean };
        if (!r.ok && r.semConsulta && !r.interrompido) {
          // Ensina a consulta sozinho: a extensão abre a CM002, pesquisa uma vez e a API passa a valer.
          await pedir("telaPlanejamentos", { aprender: true }, 120_000);
          r = (await pedir("cm002", { entidade: ent }, 300_000)) as typeof r;
        }
        if (r.interrompido) break;
        if (!r.ok || !Array.isArray(r.linhas)) {
          item.erro = r.erro ?? "a extensão não respondeu.";
          erros.push(`Entidade ${ent}: ${item.erro}`);
          setPorEntidade([...resumo]);
          if (r.semConsulta) break;
          continue;
        }
        lidosPorEntidade.push(`${ent}: ${r.linhas.length}`);
        const doSistema = new Set(dfds.map((d) => chavePlanejamento(d.planejamento)));
        item.lidos = r.linhas.length;
        for (const p of r.linhas) if (!doSistema.has(chavePlanejamento(p.id))) {
          soCenti.push({ ...p, entidade: ent });
          item.soCenti++;
        }
        setProgresso({ feito: i + 0.5, total: entidades.length, texto: `Entidade ${ent} (${i + 1} de ${entidades.length}) · gravando ${dfds.length} DFD(s)` });
        const g = (await fetch("/api/admin/automacao/execucao-dfds", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ colunas: ["ID", "SITUACAO"], linhas: r.linhas.map((p) => ({ valores: [p.id, p.situacao] })), dfdIds: dfds.map((d) => d.id) }),
        })
          .then((x) => x.json())
          .catch(() => null)) as { ok?: boolean; error?: string; atualizados?: number; em?: string; linhas?: { id: number; situacao: string | null }[] } | null;
        if (!g?.ok || !g.linhas) {
          item.erro = g?.error ?? "não consegui gravar a situação.";
          erros.push(`Entidade ${ent}: ${item.erro}`);
          setPorEntidade([...resumo]);
          continue;
        }
        atualizados += g.atualizados ?? 0;
        item.diferentes = g.linhas.filter((x) => x.situacao && classeExecucao(x.situacao) !== "executado").length;
        setPorEntidade([...resumo]);
        setSoNaCenti([...soCenti]);
        const novo = new Map(g.linhas.map((x) => [x.id, x.situacao]));
        setLinhas((ls) => ls.map((x) => (novo.has(x.id) ? { ...x, situacao: novo.get(x.id) ?? null, em: g.em ?? x.em, encontrado: !!novo.get(x.id) } : x)));
      }
      if (lote.current) await pedir("lote", { fase: "fim", loteId: lote.current, resumo: `${lidosPorEntidade.length} entidade(s) lidas` }, 8000);
      setSoNaCenti(soCenti);
      if (erros.length) setFalha({ erro: erros.join(" · ") });
      if (lidosPorEntidade.length) toast.success(`${lidosPorEntidade.length} entidade(s) lidas pela API · ${atualizados} DFD(s) atualizado(s).`);
    } finally {
      lote.current = null;
      setProgresso(null);
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
        <StatMini label="Não executados" value={String(diferentes.length)} tone={diferentes.length ? "danger" : undefined} />
        <StatMini label="Não encontrados" value={String(naoEncontrados.length)} tone={naoEncontrados.length ? "warn" : undefined} />
        <StatMini label="Só na Centi" value={String(soNaCenti.length)} />
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
      {painel !== "fechado" &&
        (progresso || porEntidade.length > 0 || falha) &&
        createPortal(
          <PainelAndamento
            progresso={progresso}
            porEntidade={porEntidade}
            falha={falha}
            recolhido={painel === "recolhido"}
            rodando={rodando}
            onAlternar={() => setPainel((p) => (p === "recolhido" ? "aberto" : "recolhido"))}
            onFechar={() => setPainel("fechado")}
          />,
          document.body,
        )}
      <Segmented
        ariaLabel="Visão da execução"
        value={visao}
        onChange={(v) => setVisao(v as Visao)}
        options={[
          { value: "todos", label: `DFDs do sistema (${linhas.length})` },
          { value: "diferentes", label: `Não executados (${diferentes.length})` },
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

/** O andamento da verificação FLUTUANDO no rodapé do display — não empurra nada da tela. */
function PainelAndamento({
  progresso,
  porEntidade,
  falha,
  recolhido,
  rodando,
  onAlternar,
  onFechar,
}: {
  progresso: { feito: number; total: number; texto: string } | null;
  porEntidade: ResumoEntidade[];
  falha: { erro: string } | null;
  recolhido: boolean;
  rodando: boolean;
  onAlternar: () => void;
  onFechar: () => void;
}) {
  const diferentes = porEntidade.reduce((s, e) => s + e.diferentes, 0);
  const falhas = porEntidade.filter((e) => e.erro).length;
  const resumo = progresso?.texto ?? `${porEntidade.length} entidade(s) · ${diferentes} ≠ executado${falhas ? ` · ${falhas} falha(s)` : ""}`;
  return (
    <section
      aria-label="Andamento da verificação"
      aria-live="polite"
      className="fixed inset-x-[var(--pad-canvas)] bottom-[calc(var(--pad-canvas)+env(safe-area-inset-bottom))] z-50 mx-auto max-w-5xl rounded-card border border-border bg-surface shadow-flutuante animate-fade-in-up max-lg:bottom-[calc(4.5rem+env(safe-area-inset-bottom))] lg:left-[calc(16rem+var(--pad-canvas))]"
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-text" title={resumo}>
          {resumo}
        </span>
        <Button variant="icon" size="sm" aria-label={recolhido ? "Mostrar detalhes" : "Recolher"} title={recolhido ? "Mostrar detalhes" : "Recolher"} onClick={onAlternar}>
          <IconChevronDown className={`size-4 transition-transform ${recolhido ? "rotate-180" : ""}`} />
        </Button>
        {!rodando && (
          <Button variant="icon" size="sm" aria-label="Fechar" title="Fechar" onClick={onFechar}>
            <IconClose className="size-4" />
          </Button>
        )}
      </div>
      {progresso && (
        <div className="px-3 pb-2">
          <Progress value={(progresso.feito / Math.max(1, progresso.total)) * 100} />
        </div>
      )}
      {!recolhido && (porEntidade.length > 0 || falha) && (
        <div className="max-h-[40vh] space-y-2 overflow-auto border-t border-border px-3 py-2">
          {falha && <Callout kind="danger">{falha.erro}</Callout>}
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(12rem,1fr))]">
            {porEntidade.map((e) => (
              <div key={e.entidade} className={`rounded-card border px-2.5 py-1.5 text-[12px] ${e.erro ? "border-danger" : "border-border"}`} title={e.erro ?? e.orgaos}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-bold text-text">Entidade {e.entidade}</span>
                  {e.erro ? <span className="text-danger">Falhou</span> : <span className="text-muted">{e.lidos} na Centi</span>}
                </div>
                <div className="truncate text-muted">{e.orgaos}</div>
                <div className="flex gap-3">
                  <span>{e.dfds} DFD(s)</span>
                  <span className={e.diferentes ? "font-semibold text-danger" : "text-muted"}>{e.diferentes} ≠</span>
                  <span className="text-muted">{e.soCenti} só Centi</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
