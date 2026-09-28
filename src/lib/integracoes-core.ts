/**
 * Núcleo PURO das integrações externas (sem `getDb`/env → testável como `avaliacao-core`).
 * Guarda a config no blob `configuracoes` id=1, sob a chave `integracoes` (sem migração).
 * Os SEGREDOS ficam CIFRADOS (blob "<ivHex>:<ctHex>") e nunca são devolvidos ao cliente —
 * o GET usa `toView` (só flags `definido`). Escopo atual: Cloudflare (Turnstile + monitoramento).
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
  /** A conta INSTITUCIONAL do Trello: `token` e `segredo` CIFRADOS ("" = não definido); `membroId`/`usuario`/`nome` = a conta
   *  confirmada no último teste (a sincronização ignora o eco das ações dela). Opcional só para os literais antigos. */
  trello?: TrelloConfig;
};
export type TrelloConfig = { ativo: boolean; apiKey: string; token: string; segredo: string; membroId: string; usuario: string; nome: string };

/** Config para o CLIENTE (sem segredos — só flags `definido`). */
export type IntegracoesView = {
  turnstile: { ativo: boolean; siteKey: string; secretDefinido: boolean };
  monitoramento: { ativo: boolean };
  trello: { ativo: boolean; apiKey: string; tokenDefinido: boolean; segredoDefinido: boolean; conta: { usuario: string; nome: string } | null };
  temChaveMestra: boolean;
};

export const TRELLO_VAZIO: TrelloConfig = { ativo: false, apiKey: "", token: "", segredo: "", membroId: "", usuario: "", nome: "" };

export function integracoesPadrao(): Integracoes {
  return {
    turnstile: { ativo: false, siteKey: "", secret: "" },
    monitoramento: { ativo: false },
    trello: { ...TRELLO_VAZIO },
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
    temChaveMestra,
  };
}

/** Trello utilizável = ativo + chave + token cifrado (o segredo só é exigido para receber os avisos do Trello). */
export function trelloConfigurado(i: Integracoes): boolean {
  return !!i.trello?.ativo && !!i.trello.apiKey && !!i.trello.token;
}

/** Turnstile utilizável = ativo + tem site key + tem secret cifrado. */
export function turnstileConfigurado(i: Integracoes): boolean {
  return i.turnstile.ativo && i.turnstile.siteKey.length > 0 && i.turnstile.secret.length > 0;
}

/** Monitoramento ligado pelo ADM (o token vem dos Worker Secrets do Cloudflare). */
export function monitoramentoAtivo(i: Integracoes): boolean {
  return i.monitoramento.ativo;
}
