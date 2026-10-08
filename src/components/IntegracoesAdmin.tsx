"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { CATALOGO_INTEGRACOES, type IntegracoesView } from "@/lib/integracoes-core";
import { Badge, type Tone } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { Checkbox, PasswordField, TextField } from "./Field";
import { IconActivity, IconAlert, IconDatabase, IconGoogle, IconKey, IconMail, IconPlug, IconRefresh, IconShield, IconTrello } from "./icons";
import { IntegracaoGoogle, type ValorGoogle } from "./IntegracaoGoogle";
import { IntegracaoResend, type ValorResend } from "./IntegracaoResend";
import { IntegracaoTrello, type ValorTrello } from "./IntegracaoTrello";
import { toast } from "./Toast";

// Tela de Integrações do ADM (admin-only): Cloudflare (Turnstile + monitoramento), o Trello (conta institucional) e o
// Resend (e-mails).
// Segredos são write-only: o secret do Turnstile é cifrado no servidor e nunca reexibido; o
// monitoramento reusa os Worker Secrets CF_ANALYTICS_TOKEN/CF_ACCOUNT_ID e é EXIBIDO na tela de Armazenamento.
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
  const [trello, setTrello] = useState<ValorTrello>({ ativo: integracoes.trello.ativo, apiKey: integracoes.trello.apiKey, token: "", segredo: "" });
  const [resend, setResend] = useState<ValorResend>({
    ativo: integracoes.resend.ativo,
    apiKey: "",
    remetente: integracoes.resend.remetente,
    urlSistema: integracoes.resend.urlSistema,
  });
  const [google, setGoogle] = useState<ValorGoogle>({ ativo: integracoes.google.ativo, clientId: integracoes.google.clientId, clientSecret: "" });
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState<"turnstile" | "monitoramento" | "trello" | "resend" | "google" | null>(null);

  const secretDefinido = integracoes.turnstile.secretDefinido;
  const semChaveMestra = !integracoes.temChaveMestra;

  async function salvar() {
    if ((secret.length > 0 || trello.token || trello.segredo || resend.apiKey || google.clientSecret) && semChaveMestra) {
      toast.error("Defina a chave mestra (INTEGRACOES_CHAVE) no Cloudflare antes de salvar o segredo.");
      return;
    }
    setSalvando(true);
    try {
      const body = {
        turnstile: { ativo: tsAtivo, siteKey: siteKey.trim(), secret },
        monitoramento: { ativo: monAtivo },
        trello: { ...trello, apiKey: trello.apiKey.trim() },
        resend: { ...resend, apiKey: resend.apiKey.trim(), remetente: resend.remetente.trim(), urlSistema: resend.urlSistema.trim() },
        google: { ...google, clientId: google.clientId.trim(), clientSecret: google.clientSecret.trim() },
      };
      const res = await fetch("/api/admin/integracoes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Erro ao salvar.");
      setSecret("");
      setTrello((t) => ({ ...t, token: "", segredo: "" }));
      setResend((r) => ({ ...r, apiKey: "" }));
      setGoogle((v) => ({ ...v, clientSecret: "" }));
      toast.success("Integrações salvas.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function testar(alvo: "turnstile" | "monitoramento" | "trello" | "resend" | "google") {
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
      if (alvo === "trello" || alvo === "resend") router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no teste.");
    } finally {
      setTestando(null);
    }
  }

  const tsStatus: [Tone, string] = !tsAtivo
    ? ["slate", "Desativado"]
    : siteKey.trim() && (secretDefinido || secret)
      ? ["emerald", "Configurado"]
      : ["amber", "Incompleto"];

  const trStatus: [Tone, string] = !trello.ativo
    ? ["slate", "Desativado"]
    : integracoes.trello.conta
      ? ["emerald", "Conectado"]
      : ["amber", "Incompleto"];

  const reStatus: [Tone, string] = !resend.ativo
    ? ["slate", "Desativado"]
    : integracoes.resend.verificado
      ? ["emerald", "Conectado"]
      : ["amber", "Incompleto"];

  const goStatus: [Tone, string] = !google.ativo
    ? ["slate", "Desativado"]
    : google.clientId.trim() && (integracoes.google.clientSecretDefinido || google.clientSecret)
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
          <Checkbox label="Mostrar as métricas do Worker (requisições, erros, CPU) na tela de Armazenamento" checked={monAtivo} onChange={(e) => setMonAtivo(e.target.checked)} />
          <p className="text-[12px] text-muted">
            Usa os secrets <span className="font-mono">CF_ANALYTICS_TOKEN</span> e{" "}
            <span className="font-mono">CF_ACCOUNT_ID</span> do Worker (os mesmos do Armazenamento).
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => testar("monitoramento")} loading={testando === "monitoramento"} icon={<IconRefresh className="h-4 w-4" />}>
              Testar conexão
            </Button>
            {integracoes.monitoramento.ativo ? (
              <Link href="/painel/armazenamento" className="inline-flex min-h-11 items-center gap-1 text-[13px] font-semibold text-accent underline-offset-2 hover:underline lg:min-h-0">
                <IconDatabase className="h-4 w-4" />
                Ver as métricas em Armazenamento
              </Link>
            ) : (
              <span className="text-[12px] text-muted">Ative e salve: as métricas aparecem na tela de Armazenamento.</span>
            )}
          </div>
        </div>
      </Cartao>

      {/* Trello (conta institucional) — a sincronização dos quadros de Tarefas nos dois sentidos */}
      <Cartao
        titulo="Trello"
        provedor="Atlassian · sincroniza os quadros de Tarefas nos dois sentidos"
        icon={<IconTrello className="h-5 w-5" />}
        status={<StatusBadge tone={trStatus[0]}>{trStatus[1]}</StatusBadge>}
      >
        <IntegracaoTrello valor={trello} onChange={setTrello} view={integracoes.trello} onTestar={() => testar("trello")} testando={testando === "trello"} />
      </Cartao>

      {/* Resend — o envio dos e-mails do sistema (avisos do sino, cadastro, liberação de acesso) */}
      <Cartao
        titulo="E-mail (Resend)"
        provedor="Resend · avisos do sino, cadastro e liberação de acesso por e-mail"
        icon={<IconMail className="h-5 w-5" />}
        status={<StatusBadge tone={reStatus[0]}>{reStatus[1]}</StatusBadge>}
      >
        <IntegracaoResend valor={resend} onChange={setResend} view={integracoes.resend} onTestar={() => testar("resend")} testando={testando === "resend"} />
      </Cartao>

      {/* Login com Google (OAuth) — e-mail cadastrado entra; e-mail novo vira cadastro pendente */}
      <Cartao
        titulo="Login com Google"
        provedor="Google · entrar com a conta Google (OAuth)"
        icon={<IconGoogle className="h-5 w-5" />}
        status={<StatusBadge tone={goStatus[0]}>{goStatus[1]}</StatusBadge>}
      >
        <IntegracaoGoogle valor={google} onChange={setGoogle} view={integracoes.google} onTestar={() => testar("google")} testando={testando === "google"} />
      </Cartao>

      {/* Em breve (sem lógica — cards informativos) */}
      {emBreve.length > 0 && (
      <section>
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-faint">Em breve</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {emBreve.map((c) => (
            <div key={c.id} className="flex items-start justify-between gap-3 rounded-card border border-dashed border-border-2 bg-surface p-[var(--pad-card)]">
              <div className="min-w-0">
                <div className="font-semibold text-text">{c.nome}</div>
                <p className="mt-0.5 text-[12.5px] text-muted">{c.descricao}</p>
              </div>
              <Badge tone="slate">Em breve</Badge>
            </div>
          ))}
        </div>
      </section>
      )}
    </div>
  );
}
