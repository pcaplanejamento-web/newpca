"use client";

import { useCallback, useEffect, useState } from "react";
import type { Armazenamento, TabelaArmazenamento } from "@/lib/armazenamento";
import type { UsoOficial } from "@/lib/cf-analytics";
import { formatBytes, num, pct } from "@/lib/format";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { type Column, DataTable } from "./DataTable";
import { IconDatabase, IconImage, IconLayers, IconRefresh, IconTrash } from "./icons";
import { KpiStat } from "./KpiStat";
import { SkeletonLinhas } from "./Skeleton";
import { StatCard } from "./StatCard";
import { toast } from "./Toast";

// Tetos diários do D1 no plano gratuito (Workers Free), para os medidores de uso.
const CAP_LEITURA = 5_000_000; // linhas lidas/dia
const CAP_ESCRITA = 100_000; // linhas escritas/dia
const corUso = (razao: number) => (razao >= 0.9 ? "var(--danger)" : razao >= 0.7 ? "var(--warn)" : "var(--ok)");

type Dados = Armazenamento & { oficial: UsoOficial };

// Tela de armazenamento do ADM: raio-x do banco (D1). Busca o snapshot no mount
// (introspecção só roda ao abrir a tela); só componentes do design-system.
export function ArmazenamentoAdmin() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [recarregando, setRecarregando] = useState(false);
  const [expurgando, setExpurgando] = useState(false);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const r = await fetch("/api/admin/armazenamento");
      const j = (await r.json()) as { ok?: boolean; error?: string } & Partial<Dados>;
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro ao carregar.");
      setDados({
        geradoEm: j.geradoEm ?? "",
        totalBytes: j.totalBytes ?? 0,
        limiteBytes: j.limiteBytes ?? 0,
        limiteContaBytes: j.limiteContaBytes ?? 0,
        tabelas: j.tabelas ?? [],
        colunasPesadas: j.colunasPesadas ?? [],
        sessoes: j.sessoes ?? { total: 0, expiradas: 0 },
        fotos: j.fotos ?? { qtd: 0, limiar: 0, maiores: [] },
        oficial: j.oficial ?? { disponivel: false, motivo: "Uso oficial não carregado." },
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar.");
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function recarregar() {
    setRecarregando(true);
    await carregar();
    setRecarregando(false);
  }

  async function expurgar() {
    if (!dados) return;
    if (!confirm(`Expurgar ${dados.sessoes.expiradas} sessão(ões) expirada(s)? Elas já estão vencidas — ninguém é deslogado.`))
      return;
    setExpurgando(true);
    setErro(null);
    try {
      const r = await fetch("/api/admin/armazenamento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "expurgar_sessoes" }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string; removidas?: number };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Não foi possível expurgar.");
      toast.success(`${num(j.removidas ?? 0)} sessão(ões) expirada(s) removida(s).`);
      await carregar();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Não foi possível expurgar.";
      setErro(msg);
      toast.error(msg);
    } finally {
      setExpurgando(false);
    }
  }

  const cabecalho = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-xl font-bold text-text">
          <IconDatabase className="h-5 w-5 text-accent" />
          Armazenamento
        </h1>
        <p className="mt-1 text-sm text-muted">
          Uso do banco de dados (D1): tamanho por tabela, colunas pesadas e manutenção.
        </p>
      </div>
      <Button variant="secondary" onClick={recarregar} loading={recarregando} icon={<IconRefresh className="h-4 w-4" />}>
        Recarregar
      </Button>
    </div>
  );

  if (dados === null) {
    return (
      <div className="space-y-[var(--gap-block)]">
        {cabecalho}
        {erro ? (
          <Callout kind="danger">{erro}</Callout>
        ) : (
          <div className="rounded-card border border-border p-4">
            <SkeletonLinhas linhas={6} />
          </div>
        )}
      </div>
    );
  }

  const totalLinhas = dados.tabelas.reduce((s, t) => s + t.linhas, 0);
  const maior = dados.tabelas[0];
  const ativas = Math.max(0, dados.sessoes.total - dados.sessoes.expiradas);
  const legadas = dados.tabelas.filter((t) => t.legado);
  const bytesLegado = legadas.reduce((s, t) => s + t.bytes, 0);
  const maiorFoto = dados.fotos.maiores[0];

  const cols: Column<TabelaArmazenamento>[] = [
    {
      key: "dominio",
      header: "Domínio",
      minWidth: 130,
      value: (t) => t.dominio,
      render: (t) => <span className="text-text-2">{t.dominio}</span>,
    },
    {
      key: "nome",
      header: "Tabela",
      minWidth: 220,
      value: (t) => t.nome,
      render: (t) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[12.5px] text-text">{t.nome}</span>
          {t.legado && <Badge tone="amber">legado</Badge>}
          {t.sistema && <Badge tone="slate">sistema</Badge>}
        </span>
      ),
    },
    {
      key: "linhas",
      header: "Linhas",
      align: "center",
      filter: "none",
      value: (t) => String(t.linhas),
      render: (t) => <span className="tabular-nums">{num(t.linhas)}</span>,
    },
    {
      key: "bytes",
      header: "Tamanho",
      align: "center",
      filter: "none",
      value: (t) => String(t.bytes),
      render: (t) => <span className="tabular-nums">{formatBytes(t.bytes)}</span>,
    },
    {
      key: "pct",
      header: "% do total",
      filter: "none",
      value: (t) => String(t.bytes),
      render: (t) => {
        const p = dados.totalBytes > 0 ? (t.bytes / dados.totalBytes) * 100 : 0;
        return (
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2">
              <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.min(100, p)}%` }} />
            </span>
            <span className="tabular-nums text-[12px] text-muted">{pct(t.bytes, dados.totalBytes)}</span>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-[var(--gap-block)]">
      {cabecalho}
      {erro && <Callout kind="danger">{erro}</Callout>}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiStat
          label="Tamanho do banco"
          value={formatBytes(dados.totalBytes)}
          hint={`${pct(dados.totalBytes, dados.limiteBytes)} de ${formatBytes(dados.limiteBytes)}`}
        />
        <KpiStat label="Linhas totais" value={num(totalLinhas)} hint={`${dados.tabelas.length} tabelas`} />
        <KpiStat
          label="Maior tabela"
          value={maior?.nome ?? "—"}
          hint={maior ? formatBytes(maior.bytes) : undefined}
          cor="var(--warn)"
        />
        <KpiStat
          label="Sessões expiradas"
          value={num(dados.sessoes.expiradas)}
          hint={`de ${num(dados.sessoes.total)} no total`}
          cor={dados.sessoes.expiradas > 0 ? "var(--warn)" : "var(--ok)"}
        />
      </div>

      {/* Uso diário oficial (Cloudflare) — leituras/escritas vs. tetos do plano free */}
      <section className="space-y-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-faint">
          Uso diário — Cloudflare (oficial)
        </h2>
        {dados.oficial.disponivel ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <KpiStat
              label="Linhas lidas hoje"
              value={num(dados.oficial.hoje.rowsRead)}
              hint={`${pct(dados.oficial.hoje.rowsRead, CAP_LEITURA)} de 5 mi/dia · reseta 00:00 UTC`}
              cor={corUso(dados.oficial.hoje.rowsRead / CAP_LEITURA)}
            />
            <KpiStat
              label="Linhas escritas hoje"
              value={num(dados.oficial.hoje.rowsWritten)}
              hint={`${pct(dados.oficial.hoje.rowsWritten, CAP_ESCRITA)} de 100 mil/dia · reseta 00:00 UTC`}
              cor={corUso(dados.oficial.hoje.rowsWritten / CAP_ESCRITA)}
            />
          </div>
        ) : (
          <Callout kind="info">
            Uso oficial (leituras/escritas por dia) indisponível — {dados.oficial.motivo}
          </Callout>
        )}
      </section>

      {/* Tabelas */}
      <section className="space-y-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-faint">Tabelas</h2>
        <DataTable
          columns={cols}
          rows={dados.tabelas}
          getKey={(t) => t.nome}
          minWidth={680}
          resumo={(linhas) => (
            <span className="tabular-nums">
              {linhas.length} tabela{linhas.length === 1 ? "" : "s"} · {num(linhas.reduce((s, t) => s + t.linhas, 0))}{" "}
              linhas · {formatBytes(linhas.reduce((s, t) => s + t.bytes, 0))}
            </span>
          )}
        />
      </section>

      {/* Colunas pesadas */}
      {dados.colunasPesadas.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-faint">Colunas pesadas</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {dados.colunasPesadas.map((c) => (
              <StatCard
                key={`${c.tabela}.${c.coluna}`}
                label={`${c.tabela}.${c.coluna}`}
                value={formatBytes(c.bytes)}
                hint={c.rotulo}
                tone="violet"
                icon={<IconLayers className="h-5 w-5" />}
              />
            ))}
          </div>
        </section>
      )}

      {/* Manutenção */}
      <section className="space-y-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-faint">Manutenção</h2>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring">
          <div className="min-w-0">
            <div className="font-semibold text-text">Sessões</div>
            <div className="text-sm text-muted">
              {num(ativas)} ativa{ativas === 1 ? "" : "s"} · {num(dados.sessoes.expiradas)} expirada
              {dados.sessoes.expiradas === 1 ? "" : "s"}
            </div>
          </div>
          <Button
            variant="danger"
            onClick={expurgar}
            loading={expurgando}
            disabled={dados.sessoes.expiradas === 0}
            icon={<IconTrash className="h-4 w-4" />}
          >
            Expurgar expiradas
          </Button>
        </div>

        {dados.fotos.qtd > 0 ? (
          <Callout kind="warn" icon={<IconImage className="h-4 w-4" />}>
            {num(dados.fotos.qtd)} foto{dados.fotos.qtd === 1 ? "" : "s"} de perfil acima de{" "}
            {formatBytes(dados.fotos.limiar)}
            {maiorFoto ? (
              <>
                {" "}
                — maior: {maiorFoto.nome} ({formatBytes(maiorFoto.bytes)})
              </>
            ) : null}
            .
          </Callout>
        ) : (
          <Callout kind="info" icon={<IconImage className="h-4 w-4" />}>
            Nenhuma foto de perfil acima de {formatBytes(dados.fotos.limiar)}.
          </Callout>
        )}

        {legadas.length > 0 && (
          <Callout kind="info">
            {legadas.length} tabela{legadas.length === 1 ? "" : "s"} legada{legadas.length === 1 ? "" : "s"} (
            {legadas.map((t) => t.nome).join(", ")}) ocupam {formatBytes(bytesLegado)} — sobra de módulo removido,
            mantidas apenas sinalizadas.
          </Callout>
        )}
      </section>

      <p className="text-[11px] text-faint">
        Tamanhos por conteúdo (aproximados). "Unidades" na interface = tabela{" "}
        <span className="font-mono">reparticoes</span>. Gerado em{" "}
        {dados.geradoEm ? new Date(dados.geradoEm).toLocaleString("pt-BR") : "—"}.
      </p>
    </div>
  );
}
