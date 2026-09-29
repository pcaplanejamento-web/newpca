/**
 * Núcleo PURO das integrações externas (sem `getDb`/env → testável como `avaliacao-core`).
 * Guarda a config no blob `configuracoes` id=1, sob a chave `integracoes` (sem migração).
 * Os SEGREDOS ficam CIFRADOS (blob "<ivHex>:<ctHex>") e nunca são devolvidos ao cliente —
 * o GET usa `toView` (só flags `definido`). Integrações: Turnstile, monitoramento, Trello, Resend e login com Google.
 */

export type StatusIntegracao = "ativo" | "em-breve";

export type IntegracaoCatalogo = {
  id: "turnstile" | "monitoramento" | "trello" | "google" | "resend";
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
  { id: "trello", nome: "Trello", provedor: "Atlassian", descricao: "Sincroniza os quadros de Tarefas com o Trello, nos dois sentidos, pela conta institucional.", status: "ativo" },
  { id: "google", nome: "Login com Google", provedor: "Google", descricao: "Entrar com a conta Google (OAuth); e-mail novo vira cadastro pendente.", status: "ativo" },
  { id: "resend", nome: "E-mail (Resend)", provedor: "Resend", descricao: "Envio de e-mails: avisos do sino, cadastro e liberação de acesso.", status: "ativo" },
];

/**
 * Config ARMAZENADA. O segredo do Turnstile fica CIFRADO ("" = não definido). O
 * monitoramento **reusa** os Worker Secrets já existentes `CF_ANALYTICS_TOKEN`/
 * `CF_ACCOUNT_ID` (os mesmos do Armazenamento) — por isso aqui só há o liga/desliga.
 */
export type Integracoes = {
  turnstile: { ativo: boolean; siteKey: string; secret: string };
  monitoramento: { ativo: boolean };
  /** A conta INSTITUCIONAL do Trello: `token` e `segredo` CIFRADOS ("" = não definido); `membroId`/`usuario`/`nome` = a conta
   *  confirmada no último teste (a sincronização ignora o eco das ações dela). Opcional só para os literais antigos. */
  trello?: TrelloConfig;
  /** O envio de e-mails pelo Resend: `apiKey` CIFRADA ("" = não definida); `dominio`/`verificado` = o último teste. */
  resend?: ResendConfig;
  /** O login com Google (OAuth): `clientSecret` CIFRADO ("" = não definido). */
  google?: GoogleConfig;
};
export type TrelloConfig = { ativo: boolean; apiKey: string; token: string; segredo: string; membroId: string; usuario: string; nome: string };
export type GoogleConfig = { ativo: boolean; clientId: string; clientSecret: string };
export type ResendConfig = { ativo: boolean; apiKey: string; remetente: string; urlSistema: string; dominio: string; verificado: boolean };

/** Config para o CLIENTE (sem segredos — só flags `definido`). */
export type IntegracoesView = {
  turnstile: { ativo: boolean; siteKey: string; secretDefinido: boolean };
  monitoramento: { ativo: boolean };
  trello: { ativo: boolean; apiKey: string; tokenDefinido: boolean; segredoDefinido: boolean; conta: { usuario: string; nome: string } | null };
  resend: { ativo: boolean; apiKeyDefinida: boolean; remetente: string; urlSistema: string; dominio: string; verificado: boolean };
  google: { ativo: boolean; clientId: string; clientSecretDefinido: boolean };
  temChaveMestra: boolean;
};

export const TRELLO_VAZIO: TrelloConfig = { ativo: false, apiKey: "", token: "", segredo: "", membroId: "", usuario: "", nome: "" };
/** O endereço do sistema nos links dos e-mails (o cron não tem requisição de onde tirar a origem). */
export const URL_SISTEMA_PADRAO = "https://governarv.com.br";
export const RESEND_VAZIO: ResendConfig = { ativo: false, apiKey: "", remetente: "", urlSistema: URL_SISTEMA_PADRAO, dominio: "", verificado: false };

export const GOOGLE_VAZIO: GoogleConfig = { ativo: false, clientId: "", clientSecret: "" };

export function integracoesPadrao(): Integracoes {
  return {
    turnstile: { ativo: false, siteKey: "", secret: "" },
    monitoramento: { ativo: false },
    trello: { ...TRELLO_VAZIO },
    resend: { ...RESEND_VAZIO },
    google: { ...GOOGLE_VAZIO },
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
    trello: {
      ativo: bool(r.trello?.ativo, false),
      apiKey: str(r.trello?.apiKey, ""),
      token: str(r.trello?.token, ""),
      segredo: str(r.trello?.segredo, ""),
      membroId: str(r.trello?.membroId, ""),
      usuario: str(r.trello?.usuario, ""),
      nome: str(r.trello?.nome, ""),
    },
    resend: {
      ativo: bool(r.resend?.ativo, false),
      apiKey: str(r.resend?.apiKey, ""),
      remetente: str(r.resend?.remetente, ""),
      urlSistema: str(r.resend?.urlSistema, "") || URL_SISTEMA_PADRAO,
      dominio: str(r.resend?.dominio, ""),
      verificado: bool(r.resend?.verificado, false),
    },
    google: {
      ativo: bool(r.google?.ativo, false),
      clientId: str(r.google?.clientId, ""),
      clientSecret: str(r.google?.clientSecret, ""),
    },
  };
}

/** Remove os segredos, expondo só `definido` (o que o cliente pode ver). */
export function toView(i: Integracoes, temChaveMestra: boolean): IntegracoesView {
  return {
    turnstile: { ativo: i.turnstile.ativo, siteKey: i.turnstile.siteKey, secretDefinido: i.turnstile.secret.length > 0 },
    monitoramento: { ativo: i.monitoramento.ativo },
    trello: {
      ativo: !!i.trello?.ativo,
      apiKey: i.trello?.apiKey ?? "",
      tokenDefinido: !!i.trello?.token,
      segredoDefinido: !!i.trello?.segredo,
      conta: i.trello?.membroId ? { usuario: i.trello.usuario, nome: i.trello.nome } : null,
    },
    resend: {
      ativo: !!i.resend?.ativo,
      apiKeyDefinida: !!i.resend?.apiKey,
      remetente: i.resend?.remetente ?? "",
      urlSistema: i.resend?.urlSistema || URL_SISTEMA_PADRAO,
      dominio: i.resend?.dominio ?? "",
      verificado: !!i.resend?.verificado,
    },
    google: { ativo: !!i.google?.ativo, clientId: i.google?.clientId ?? "", clientSecretDefinido: !!i.google?.clientSecret },
    temChaveMestra,
  };
}

/** Trello utilizável = ativo + chave + token cifrado (o segredo só é exigido para receber os avisos do Trello). */
export function trelloConfigurado(i: Integracoes): boolean {
  return !!i.trello?.ativo && !!i.trello.apiKey && !!i.trello.token;
}

/** Login com Google utilizável = ativo + client ID + client secret cifrado. */
export function googleConfigurado(i: Integracoes): boolean {
  return !!i.google?.ativo && !!i.google.clientId && !!i.google.clientSecret;
}

/** Resend utilizável = ativo + chave cifrada + remetente com e-mail. */
export function resendConfigurado(i: Integracoes): boolean {
  return !!i.resend?.ativo && !!i.resend.apiKey && !!emailDoRemetente(i.resend.remetente);
}

/** O ENDEREÇO do remetente ("Nome <avisos@dominio>" ou só "avisos@dominio"); "" se não houver um e-mail válido. */
export function emailDoRemetente(remetente: string): string {
  const t = remetente.trim();
  const m = /<([^<>\s]+)>\s*$/.exec(t);
  const e = (m ? m[1] : t).trim().toLowerCase();
  return /^[^@\s<>]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(e) ? e : "";
}

/** O DOMÍNIO do remetente (o que tem de estar verificado no Resend). */
export function dominioDoRemetente(remetente: string): string {
  const e = emailDoRemetente(remetente);
  return e ? e.slice(e.indexOf("@") + 1) : "";
}

/** Turnstile utilizável = ativo + tem site key + tem secret cifrado. */
export function turnstileConfigurado(i: Integracoes): boolean {
  return i.turnstile.ativo && i.turnstile.siteKey.length > 0 && i.turnstile.secret.length > 0;
}

/** Monitoramento ligado pelo ADM (o token vem dos Worker Secrets do Cloudflare). */
export function monitoramentoAtivo(i: Integracoes): boolean {
  return i.monitoramento.ativo;
}
