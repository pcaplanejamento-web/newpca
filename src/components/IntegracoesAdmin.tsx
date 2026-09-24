"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import type { Metricas, PontoMetrica } from "@/lib/cloudflare-core";
import { CATALOGO_INTEGRACOES, type IntegracoesView } from "@/lib/integracoes-core";
import { num } from "@/lib/format";
import { Badge, type Tone } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { ChartCard } from "./ChartCard";
import { MetricasChart } from "./charts/MetricasChart";
import { type Column, DataTable } from "./DataTable";
import { Checkbox, PasswordField, TextField } from "./Field";
import { IconActivity, IconAlert, IconKey, IconPlug, IconRefresh, IconShield } from "./icons";
import { KpiStat } from "./KpiStat";
import { OrigemDados } from "./OrigemDados";
import { toast } from "./Toast";

const COLS_DIA: Column<PontoMetrica>[] = [
  { key: "data", header: "Dia", nowrap: true, value: (p) => p.data, render: (p) => <span className="tabular-nums">{p.data.split("-").reverse().join("/")}</span> },
  { key: "req", header: "Requisições", nowrap: true, filter: "range", numero: (p) => p.requests, render: (p) => num(p.requests) },
  { key: "err", header: "Erros", nowrap: true, filter: "range", numero: (p) => p.errors, render: (p) => num(p.errors) },
];

// Tela de Integrações do ADM (admin-only). Escopo atual: Cloudflare (Turnstile + monitoramento).
// Segredos são write-only: o secret do Turnstile é cifrado no servidor e nunca reexibido; o
// monitoramento reusa os Worker Secrets CF_ANALYTICS_TOKEN/CF_ACCOUNT_ID (mesmos do Armazenamento).
// Só componentes do design-system.

function StatusBadge({ tone, children }: { tone: Tone; children: string }) {
  return (
    <Badge tone={tone} dot>
      {children}
    </Badge>
  );
}

function Cartao({
  titulo,
  provedor,
  icon,
  status,
  children,
}: {
  titulo: string;
  provedor: string;
  icon: ReactNode;
  status: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">{icon}</div>
          <div className="min-w-0">
            <h2 className="font-bold text-text">{titulo}</h2>
            <p className="text-[12px] text-muted">{provedor}</p>
          </div>
        </div>
        {status}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </section>
  );
}

export function IntegracoesAdmin({ integracoes }: { integracoes: IntegracoesView }) {
  const router = useRouter();
  const [tsAtivo, setTsAtivo] = useState(integracoes.turnstile.ativo);
  const [siteKey, setSiteKey] = useState(integracoes.turnstile.siteKey);
  const [secret, setSecret] = useState(""); // sempre começa vazio (write-only)
  const [monAtivo, setMonAtivo] = useState(integracoes.monitoramento.ativo);
  const [dia, setDia] = useState<PontoMetrica | null>(null);
  const [diaMostrado, setDiaMostrado] = useState<PontoMetrica | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState<"turnstile" | "monitoramento" | null>(null);

  const secretDefinido = integracoes.turnstile.secretDefinido;
  const semChaveMestra = !integracoes.temChaveMestra;

  async function salvar() {
    if ((secret.length > 0) && semChaveMestra) {
      toast.error("Defina a chave mestra (INTEGRACOES_CHAVE) no Cloudflare antes de salvar o segredo.");
      return;
    }
    setSalvando(true);
    try {
      const body = {
        turnstile: { ativo: tsAtivo, siteKey: siteKey.trim(), secret },
        monitoramento: { ativo: monAtivo },
      };
      const res = await fetch("/api/admin/integracoes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Erro ao salvar.");
      setSecret("");
      toast.success("Integrações salvas.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function testar(alvo: "turnstile" | "monitoramento") {
    setTestando(alvo);
    try {
      const res = await fetch("/api/admin/integracoes/testar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alvo }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string; detalhe?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Falha no teste.");
      toast.success(j.detalhe ?? "Conexão OK.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no teste.");
    } finally {
      setTestando(null);
    }
  }

  // Métricas do monitoramento (carrega só quando SALVO como ativo).
  const [metricas, setMetricas] = useState<Metricas | null>(null);
  const [erroMetricas, setErroMetricas] = useState<string | null>(null);
  const [carregandoMetricas, setCarregandoMetricas] = useState(false);
  const carregarMetricas = useCallback(async () => {
    setCarregandoMetricas(true);
    setErroMetricas(null);
    try {
      const res = await fetch("/api/admin/integracoes/metricas");
      const j = (await res.json()) as { ok?: boolean; error?: string; metricas?: Metricas };
      if (!res.ok || !j.ok || !j.metricas) throw new Error(j.error ?? "Falha ao carregar métricas.");
      setMetricas(j.metricas);
    } catch (e) {
      setErroMetricas(e instanceof Error ? e.message : "Falha ao carregar métricas.");
    } finally {
      setCarregandoMetricas(false);
    }
  }, []);
  useEffect(() => {
    if (integracoes.monitoramento.ativo) carregarMetricas();
  }, [integracoes.monitoramento.ativo, carregarMetricas]);

  const tsStatus: [Tone, string] = !tsAtivo
    ? ["slate", "Desativado"]
    : siteKey.trim() && (secretDefinido || secret)
      ? ["emerald", "Configurado"]
      : ["amber", "Incompleto"];

  const emBreve = CATALOGO_INTEGRACOES.filter((c) => c.status === "em-breve");

  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold text-text">
            <IconPlug className="h-5 w-5 text-accent" />
            Integrações
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Conecte serviços externos. Ative e configure cada um; nada muda no sistema até você ligar.
          </p>
        </div>
        <Button onClick={salvar} loading={salvando}>
          Salvar
        </Button>
      </div>

      {semChaveMestra && (
        <Callout kind="warn" icon={<IconAlert className="h-5 w-5" />}>
          Para guardar segredos com segurança, defina a <strong>chave mestra</strong>{" "}
          <span className="font-mono">INTEGRACOES_CHAVE</span> no Cloudflare (uma vez). Veja{" "}
          <span className="font-mono">docs/INTEGRACOES.md</span>. Sem ela, o site funciona normalmente — só não é
          possível salvar o segredo do captcha.
        </Callout>
      )}

      {/* Cloudflare Turnstile (captcha) */}
      <Cartao
        titulo="Captcha (Turnstile)"
        provedor="Cloudflare · protege login e cadastro"
        icon={<IconShield className="h-5 w-5" />}
        status={<StatusBadge tone={tsStatus[0]}>{tsStatus[1]}</StatusBadge>}
      >
        <div className="space-y-[var(--gap-block)]">
          <Checkbox label="Ativar captcha no login e no cadastro" checked={tsAtivo} onChange={(e) => setTsAtivo(e.target.checked)} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField
              label="Site key (pública)"
              icon={<IconKey className="h-5 w-5" />}
              value={siteKey}
              onChange={(e) => setSiteKey(e.target.value)}
              placeholder="0x4AAAAAAA..."
              autoComplete="off"
            />
            <PasswordField
              label="Secret key"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder={secretDefinido ? "•••••• (definido — deixe em branco p/ manter)" : "cole a chave secreta"}
              autoComplete="off"
              hint={secretDefinido ? "Já definido. Preencha só para substituir." : "Cifrado no servidor; nunca reexibido."}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => testar("turnstile")} loading={testando === "turnstile"} icon={<IconRefresh className="h-4 w-4" />}>
              Testar conexão
            </Button>
            <span className="text-[12px] text-muted">Crie o widget no painel Cloudflare (Turnstile) e permita o domínio governarv.com.br.</span>
          </div>
        </div>
      </Cartao>

      {/* Cloudflare monitoramento (métricas) */}
      <Cartao
        titulo="Monitoramento"
        provedor="Cloudflare · métricas do Worker"
        icon={<IconActivity className="h-5 w-5" />}
        status={<StatusBadge tone={monAtivo ? "emerald" : "slate"}>{monAtivo ? "Ativado" : "Desativado"}</StatusBadge>}
      >
        <div className="space-y-[var(--gap-block)]">
          <Checkbox label="Mostrar métricas do Worker (requisições, erros, CPU)" checked={monAtivo} onChange={(e) => setMonAtivo(e.target.checked)} />
          <p className="text-[12px] text-muted">
            Usa os secrets <span className="font-mono">CF_ANALYTICS_TOKEN</span> e{" "}
            <span className="font-mono">CF_ACCOUNT_ID</span> do Worker (os mesmos do Armazenamento).
          </p>

          {integracoes.monitoramento.ativo && (
            <div className="space-y-3">
              {erroMetricas ? (
                <Callout kind="danger">{erroMetricas}</Callout>
              ) : metricas ? (
                <>
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <KpiStat label="Requisições (7d)" value={num(metricas.totalRequests)} />
                    <KpiStat label="Erros (7d)" value={num(metricas.totalErrors)} cor={metricas.totalErrors > 0 ? "var(--warn)" : "var(--ok)"} />
                    <KpiStat label="Taxa de erro" value={`${metricas.erroPct}%`} cor={metricas.erroPct >= 1 ? "var(--danger)" : "var(--ok)"} />
                    <KpiStat label="CPU p99" value={metricas.cpuP99 != null ? `${num(metricas.cpuP99)} µs` : "—"} />
                  </div>
                  <ChartCard title="Requisições por dia" subtitle="Últimos 7 dias — clique numa barra para ver a origem">
                    <MetricasChart
                      data={metricas.dias}
                      onSelecionar={(p) => {
                        setDia(p);
                        setDiaMostrado(p);
                      }}
                    />
                  </ChartCard>
                  <OrigemDados
                    aberto={dia != null}
                    onClose={() => setDia(null)}
                    titulo="Requisições por dia"
                    recorte={diaMostrado ? diaMostrado.data.split("-").reverse().join("/") : ""}
                    resumo={[
                      { label: "Requisições", value: num(diaMostrado?.requests ?? 0) },
                      { label: "Erros", value: num(diaMostrado?.errors ?? 0) },
                    ]}
                    fonte="Cloudflare Workers Analytics (API GraphQL) da conta configurada nas Integrações — somatório diário do Worker, com cache de 60 s."
                  >
                    <DataTable
                      columns={COLS_DIA}
                      rows={metricas.dias}
                      getKey={(p) => p.data}
                      activeKey={diaMostrado?.data ?? null}
                      pageSize={20}
                      minWidth={360}
                      resumo={(ps) => `${num(ps.length)} dia(s) · ${num(ps.reduce((s, p) => s + p.requests, 0))} requisições · ${num(ps.reduce((s, p) => s + p.errors, 0))} erros`}
                    />
                  </OrigemDados>
                </>
              ) : (
                <p className="text-[13px] text-muted">{carregandoMetricas ? "Carregando métricas…" : "Sem métricas."}</p>
              )}
              <Button
                variant="secondary"
                onClick={carregarMetricas}
                loading={carregandoMetricas}
                icon={<IconRefresh className="h-4 w-4" />}
              >
                Recarregar métricas
              </Button>
            </div>
          )}
          {!integracoes.monitoramento.ativo && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={() => testar("monitoramento")} loading={testando === "monitoramento"} icon={<IconRefresh className="h-4 w-4" />}>
                Testar conexão
              </Button>
              <span className="text-[12px] text-muted">Ative e salve para ver as métricas.</span>
            </div>
          )}
        </div>
      </Cartao>

      {/* Em breve (sem lógica — cards informativos) */}
      <section>
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-faint">Em breve</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {emBreve.map((c) => (
            <div key={c.id} className="flex items-start justify-between gap-3 rounded-card border border-dashed border-border-2 bg-surface p-4">
              <div className="min-w-0">
                <div className="font-semibold text-text">{c.nome}</div>
                <p className="mt-0.5 text-[12.5px] text-muted">{c.descricao}</p>
              </div>
              <Badge tone="slate">Em breve</Badge>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
