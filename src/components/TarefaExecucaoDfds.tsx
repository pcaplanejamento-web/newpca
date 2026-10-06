"use client";

import { type MutableRefObject, useCallback, useEffect, useMemo, useState } from "react";
import { chaveOrgaoCenti } from "@/lib/automacao-centi-core";
import { classeExecucao, mesmaEntidade } from "@/lib/execucao-centi";
import { dataHoraBR } from "@/lib/format";
import { CelulaCopiavel } from "./BotaoCopiar";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { CelulaExecucao } from "./CelulaExecucao";
import { type Column, DataTable } from "./DataTable";
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
};
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
 * Tarefa "Verificar execução dos DFDs": lê a SITUAÇÃO de cada planejamento na tela CM002 da Centi (ID = nº de planejamento)
 * e grava em cada DFD do sistema. A CM002 mostra só os planejamentos da ENTIDADE aberta na Centi — por isso só os DFDs do
 * órgão ligado a essa entidade (o mapa órgão → entidade do "Baixar DFDs") recebem a situação lida. Só leitura na Centi.
 */
export function TarefaExecucaoDfds({
  pedir,
  lote,
  pronto,
  entidade,
  mapa,
  onEntidade,
  onRodando,
}: {
  pedir: Pedir;
  lote: MutableRefObject<string | null>;
  /** A extensão e a sessão da Centi prontas. */
  pronto: boolean;
  /** A entidade aberta na Centi agora (null = não informada). */
  entidade: string | null;
  /** Órgão (chave) → entidade da Centi. */
  mapa: Record<string, string>;
  onEntidade: (orgao: string, entidade: string) => void;
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
  const daEntidade = useMemo(
    () => (entidade ? linhas.filter((l) => l.orgao && mesmaEntidade(mapa[l.orgao], entidade)) : []),
    [linhas, mapa, entidade],
  );

  async function verificar() {
    if (rodando || !daEntidade.length) return;
    setRodando(true);
    setFalha(null);
    setAviso(null);
    try {
      const ids = [...new Set(daEntidade.map((l) => l.planejamento.replace(/\D/g, "").replace(/^0+/, "")).filter(Boolean))];
      const l = await pedir("lote", { fase: "inicio", titulo: "CM002 · Execução dos DFDs", total: 1 }, 8000);
      lote.current = l.loteId ?? null;
      await pedir("lote", { fase: "passo", loteId: lote.current, feito: 0, total: 1, texto: `Lendo a situação de ${ids.length} planejamento(s) (CM002)` }, 8000);
      const r = await pedir("telaPlanejamentos", { ids }, 600_000);
      if (lote.current)
        await pedir("lote", { fase: "fim", loteId: lote.current, resumo: r.ok ? `${Array.isArray(r.linhas) ? r.linhas.length : 0} planejamento(s) lidos` : (r.erro ?? "Falhou") }, 8000);
      if (!r.ok) {
        setFalha({ erro: r.erro ?? "A extensão não respondeu.", diagnostico: typeof r.diagnostico === "string" ? r.diagnostico : undefined });
        toast.error(r.erro ?? "A extensão não respondeu.", 12000);
        return;
      }
      const g = (await fetch("/api/admin/automacao/execucao-dfds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ colunas: r.colunas, linhas: r.linhas, dfdIds: daEntidade.map((x) => x.id) }),
      })
        .then((x) => x.json())
        .catch(() => null)) as { ok?: boolean; error?: string; lidos?: number; atualizados?: number; em?: string; linhas?: { id: number; situacao: string | null }[] } | null;
      if (!g?.ok || !g.linhas) {
        toast.error(g?.error ?? "Não consegui gravar a situação dos DFDs.");
        return;
      }
      const novo = new Map(g.linhas.map((x) => [x.id, x.situacao]));
      setLinhas((ls) => ls.map((x) => (novo.get(x.id) ? { ...x, situacao: novo.get(x.id) ?? x.situacao, em: g.em ?? x.em } : x)));
      const nao = g.linhas.filter((x) => !x.situacao).length;
      const lidas = Array.isArray(r.linhas) ? r.linhas.length : 0;
      const total = typeof r.total === "number" ? r.total : null;
      if (nao)
        setAviso(
          `${nao} de ${g.linhas.length} DFD(s) da entidade ${entidade} não aparecem na CM002 (${lidas} planejamento(s) lidos${total ? ` de ${total}` : ""}).` +
            (total && lidas < total ? " Ponha o “Mostrar” no maior valor na CM002 e verifique de novo." : ""),
        );
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

  return (
    <div className="flex min-h-0 flex-col gap-[var(--gap-block)]">
      <div className="flex flex-wrap items-center gap-2">
        <StatMini label="Executados" value={String(conta.executado)} tone="ok" />
        <StatMini label="Cancelados" value={String(conta.cancelado)} tone="danger" />
        <StatMini label="Outra situação" value={String(conta.outro)} tone="warn" />
        <StatMini label="Não verificados" value={String(conta.sem)} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-muted">
            Entidade aberta: <strong className="font-mono text-text">{entidade ?? "—"}</strong> · {daEntidade.length} DFD(s) dela
          </span>
          <Button size="sm" onClick={verificar} loading={rodando} disabled={!pronto || !daEntidade.length}>
            Verificar na Centi (CM002)
          </Button>
        </div>
      </div>
      {entidade && !daEntidade.length && (
        <Callout kind="warn">
          Nenhum órgão está ligado à entidade aberta na Centi ({entidade}). A CM002 mostra só os planejamentos dessa entidade:
          cadastre o “ID da entidade na Centi” no órgão (Órgãos e Unidades) ou ligue abaixo o órgão correspondente.
        </Callout>
      )}
      {entidade && semLigacao.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="text-muted">Órgãos sem entidade da Centi:</span>
          {semLigacao.slice(0, 12).map((o) => (
            <Button key={o.chave} size="xs" variant="secondary" onClick={() => onEntidade(o.chave, entidade)} title={`Ligar à entidade aberta (${entidade})`}>
              {o.nome} ({o.dfds}) → {entidade}
            </Button>
          ))}
          {semLigacao.length > 12 && <span className="text-muted">e mais {semLigacao.length - 12} — veja em Ajustes → Entidade por órgão</span>}
        </div>
      )}
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
