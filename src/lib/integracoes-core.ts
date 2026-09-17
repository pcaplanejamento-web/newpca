/**
 * Núcleo PURO das integrações externas (sem `getDb`/env → testável como `avaliacao-core`).
 * Guarda a config no blob `configuracoes` id=1, sob a chave `integracoes` (sem migração).
 * Os SEGREDOS ficam CIFRADOS (blob "<ivHex>:<ctHex>") e nunca são devolvidos ao cliente —
 * o GET usa `toView` (só flags `definido`). Escopo atual: Cloudflare (Turnstile + monitoramento).
 */

export type StatusIntegracao = "ativo" | "em-breve";

export type IntegracaoCatalogo = {
  id: "turnstile" | "monitoramento" | "google" | "resend";
  nome: string;
  provedor: string;
  descricao: string;
  status: StatusIntegracao;
};

// Catálogo = fonte única dos cards da tela. Só os "ativo" têm configuração/fiação;
// os "em-breve" são cards informativos (sem lógica → sem código morto).
export const CATALOGO_INTEGRACOES: IntegracaoCatalogo[] = [
  { id: "turnstile", nome: "Captcha (Turnstile)", provedor: "Cloudflare", descricao: "Proteção anti-robô nos formulários de login e cadastro.", status: "ativo" },
  { id: "monitoramento", nome: "Monitoramento", provedor: "Cloudflare", descricao: "Métricas de requisições, erros e CPU do Worker (via API).", status: "ativo" },
  { id: "google", nome: "Login com Google", provedor: "Google", descricao: "Entrar com a conta Google (OAuth). Em breve.", status: "em-breve" },
  { id: "resend", nome: "E-mail (Resend)", provedor: "Resend", descricao: "Envio de e-mails (aprovação de cadastro, avisos). Em breve.", status: "em-breve" },
];

/**
 * Config ARMAZENADA. O segredo do Turnstile fica CIFRADO ("" = não definido). O
 * monitoramento **reusa** os Worker Secrets já existentes `CF_ANALYTICS_TOKEN`/
 * `CF_ACCOUNT_ID` (os mesmos do Armazenamento) — por isso aqui só há o liga/desliga.
 */
export type Integracoes = {
  turnstile: { ativo: boolean; siteKey: string; secret: string };
  monitoramento: { ativo: boolean };
};

/** Config para o CLIENTE (sem segredos — só flags `definido`). */
export type IntegracoesView = {
  turnstile: { ativo: boolean; siteKey: string; secretDefinido: boolean };
  monitoramento: { ativo: boolean };
  temChaveMestra: boolean;
};

export function integracoesPadrao(): Integracoes {
  return {
    turnstile: { ativo: false, siteKey: "", secret: "" },
    monitoramento: { ativo: false },
  };
}

/** Coage um blob solto (JSON do D1) para `Integracoes`, tolerante e com defaults. */
export function coerceIntegracoes(bruto: unknown): Integracoes {
  const r = (bruto && typeof bruto === "object" ? bruto : {}) as Partial<Integracoes>;
  const pad = integracoesPadrao();
  const str = (v: unknown, d: string) => (typeof v === "string" ? v : d);
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  return {
    turnstile: {
      ativo: bool(r.turnstile?.ativo, pad.turnstile.ativo),
      siteKey: str(r.turnstile?.siteKey, pad.turnstile.siteKey),
      secret: str(r.turnstile?.secret, pad.turnstile.secret),
    },
    monitoramento: { ativo: bool(r.monitoramento?.ativo, pad.monitoramento.ativo) },
  };
}

/** Remove os segredos, expondo só `definido` (o que o cliente pode ver). */
export function toView(i: Integracoes, temChaveMestra: boolean): IntegracoesView {
  return {
    turnstile: { ativo: i.turnstile.ativo, siteKey: i.turnstile.siteKey, secretDefinido: i.turnstile.secret.length > 0 },
    monitoramento: { ativo: i.monitoramento.ativo },
    temChaveMestra,
  };
}

/** Turnstile utilizável = ativo + tem site key + tem secret cifrado. */
export function turnstileConfigurado(i: Integracoes): boolean {
  return i.turnstile.ativo && i.turnstile.siteKey.length > 0 && i.turnstile.secret.length > 0;
}

/** Monitoramento ligado pelo ADM (o token vem dos Worker Secrets do Cloudflare). */
export function monitoramentoAtivo(i: Integracoes): boolean {
  return i.monitoramento.ativo;
}
