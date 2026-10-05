/**
 * Núcleo PURO da CONFIGURAÇÃO das notificações (sem getDb → testável): o CATÁLOGO dos avisos do sistema e, por aviso, os
 * CANAIS — o SINO (o aviso existe ou não) e o E-MAIL — e se a PESSOA pode desligar o e-mail. O ADM decide em
 * Configurações → Notificações (blob `configuracoes`, chave `notificacoes`); a config vazia = os PADRÕES do catálogo, com o
 * e-mail no MÍNIMO (só o fundamental). A pessoa, no Perfil, só DESLIGA os e-mails que o ADM deixou desligáveis.
 */

import { TIPOS_NOTIFICACAO, type TipoNotificacao } from "./tarefas-core.ts";

/** Os avisos que só existem por e-mail (sem sino): o acesso liberado (a pessoa ainda não entrava no sistema). */
export const AVISOS_SO_EMAIL = ["acesso"] as const;
export type ChaveAviso = TipoNotificacao | (typeof AVISOS_SO_EMAIL)[number];
export const CHAVES_AVISO: readonly ChaveAviso[] = [...TIPOS_NOTIFICACAO, ...AVISOS_SO_EMAIL];

export const GRUPOS_AVISO = ["Tarefas", "Calendário", "Mesa e PCA", "Administração"] as const;
export type GrupoAviso = (typeof GRUPOS_AVISO)[number];

export type Canais = { sino: boolean; email: boolean; desligavel: boolean };
export type ItemCatalogoAviso = {
  chave: ChaveAviso;
  rotulo: string;
  descricao: string;
  grupo: GrupoAviso;
  /** O padrão (config vazia). */
  padrao: Canais;
  /** Sem sino (só e-mail). */
  soEmail?: boolean;
};

const c = (sino: boolean, email: boolean, desligavel = true): Canais => ({ sino, email, desligavel });

/** O CATÁLOGO — a fonte única da tela do ADM, do Perfil, do envio e do sino. E-mail ligado SÓ no fundamental. */
export const CATALOGO_AVISOS: readonly ItemCatalogoAviso[] = [
  { chave: "atribuida", rotulo: "Tarefa atribuída", descricao: "A pessoa (ou a equipe dela) passou a ser responsável por uma tarefa.", grupo: "Tarefas", padrao: c(true, true) },
  { chave: "atrasada", rotulo: "Tarefa atrasada", descricao: "O prazo de uma tarefa ou item de checklist da pessoa passou.", grupo: "Tarefas", padrao: c(true, true) },
  { chave: "vence_hoje", rotulo: "Vence hoje", descricao: "Uma tarefa da pessoa vence hoje.", grupo: "Tarefas", padrao: c(true, false) },
  { chave: "vence_amanha", rotulo: "Vence amanhã", descricao: "Uma tarefa ou item de checklist da pessoa vence amanhã.", grupo: "Tarefas", padrao: c(true, false) },
  { chave: "mencionada", rotulo: "Menção", descricao: "Alguém citou a pessoa (@) num comentário.", grupo: "Tarefas", padrao: c(true, false) },
  { chave: "comentario", rotulo: "Comentário", descricao: "Novo comentário numa tarefa que a pessoa acompanha.", grupo: "Tarefas", padrao: c(true, false) },
  { chave: "automacao", rotulo: "Automação", descricao: "Uma regra do quadro avisou a pessoa.", grupo: "Tarefas", padrao: c(true, false) },
  { chave: "convite", rotulo: "Convite para evento", descricao: "A pessoa foi convidada para um evento.", grupo: "Calendário", padrao: c(true, true) },
  { chave: "evento", rotulo: "Evento alterado ou cancelado", descricao: "Mudou a data, a hora ou o local — ou o evento foi cancelado.", grupo: "Calendário", padrao: c(true, false) },
  { chave: "lembrete", rotulo: "Lembrete", descricao: "O lembrete de um evento ou prazo chegou.", grupo: "Calendário", padrao: c(true, false) },
  { chave: "resposta", rotulo: "Resposta a convite", descricao: "Um convidado respondeu ao evento que a pessoa criou.", grupo: "Calendário", padrao: c(true, false) },
  { chave: "protocolo", rotulo: "Protocolo designado", descricao: "A pessoa passou a ser a responsável por um protocolo da Mesa.", grupo: "Mesa e PCA", padrao: c(true, true) },
  { chave: "pca", rotulo: "Protocolo no PCA", descricao: "Um protocolo da pessoa foi enviado, incorporado ou devolvido no PCA.", grupo: "Mesa e PCA", padrao: c(true, false) },
  { chave: "cadastro", rotulo: "Cadastro aguardando aprovação", descricao: "Aos administradores: uma pessoa pediu acesso.", grupo: "Administração", padrao: c(true, true, false) },
  { chave: "acesso", rotulo: "Acesso liberado", descricao: "À pessoa: o administrador aprovou o cadastro.", grupo: "Administração", padrao: c(false, true, false), soEmail: true },
];

const PORCHAVE = new Map(CATALOGO_AVISOS.map((i) => [i.chave, i]));
export const itemAviso = (chave: string): ItemCatalogoAviso | undefined => PORCHAVE.get(chave as ChaveAviso);

/** A config do ADM: por aviso, os canais. Só o que difere do padrão é guardado. */
export type ConfigNotificacoes = Partial<Record<ChaveAviso, Partial<Canais>>>;
/** A config resolvida: todo aviso com os três canais. */
export type ConfigResolvida = Record<ChaveAviso, Canais>;

/** Qualquer JSON → a config RESOLVIDA (chave desconhecida sai; o aviso só-e-mail nunca tem sino). */
export function resolverNotificacoes(valor: unknown): ConfigResolvida {
  const v = valor && typeof valor === "object" ? (valor as Record<string, unknown>) : {};
  const out = {} as ConfigResolvida;
  for (const i of CATALOGO_AVISOS) {
    const g = v[i.chave] && typeof v[i.chave] === "object" ? (v[i.chave] as Record<string, unknown>) : {};
    const b = (k: keyof Canais) => (typeof g[k] === "boolean" ? (g[k] as boolean) : i.padrao[k]);
    out[i.chave] = { sino: i.soEmail ? false : b("sino"), email: b("email"), desligavel: b("desligavel") };
  }
  return out;
}

/** A config resolvida → só o que difere do padrão (o que se grava). */
export function compactarNotificacoes(r: ConfigResolvida): ConfigNotificacoes {
  const out: ConfigNotificacoes = {};
  for (const i of CATALOGO_AVISOS) {
    const d: Partial<Canais> = {};
    for (const k of ["sino", "email", "desligavel"] as const) if (r[i.chave][k] !== i.padrao[k] && !(i.soEmail && k === "sino")) d[k] = r[i.chave][k];
    if (Object.keys(d).length) out[i.chave] = d;
  }
  return out;
}

// ─── PREFERÊNCIA DA PESSOA (só desliga e-mails; `preferencias_tabela`, chave `email:notificacoes`) ──────────────────

export const DESTINOS_EMAIL = ["institucional", "google"] as const;
export type DestinoEmail = (typeof DESTINOS_EMAIL)[number];
/** `ligado: false` = desliga TODOS os desligáveis; `desligados` = os que a pessoa tirou. */
export type PrefsEmail = { ligado: boolean; desligados: ChaveAviso[]; destino: DestinoEmail };
export const PREFS_EMAIL_PADRAO: PrefsEmail = { ligado: true, desligados: [], destino: "institucional" };

/**
 * Lê a preferência gravada (qualquer JSON → válido). Compatível com o formato ANTERIOR (`tipos` = a lista dos que a pessoa
 * QUERIA): o que ficou de fora vira desligado.
 */
export function lerPrefsEmail(valor: unknown): PrefsEmail {
  if (!valor || typeof valor !== "object") return { ...PREFS_EMAIL_PADRAO, desligados: [] };
  const v = valor as { ligado?: unknown; tipos?: unknown; desligados?: unknown; destino?: unknown };
  let desligados: ChaveAviso[] = [];
  if (Array.isArray(v.desligados)) desligados = CHAVES_AVISO.filter((k) => (v.desligados as unknown[]).includes(k));
  else if (Array.isArray(v.tipos)) desligados = TIPOS_NOTIFICACAO.filter((k) => !(v.tipos as unknown[]).includes(k));
  return { ligado: typeof v.ligado === "boolean" ? v.ligado : true, desligados, destino: v.destino === "google" ? "google" : "institucional" };
}

/** O endereço que recebe os avisos: a conta Google vinculada quando escolhida (e existe); senão, o institucional. */
export function enderecoDosAvisos(prefs: PrefsEmail, email: string, googleEmail: string | null | undefined): string {
  return prefs.destino === "google" && googleEmail ? googleEmail : email;
}

/** O aviso aparece no SINO? */
export const noSino = (cfg: ConfigResolvida, chave: string): boolean => {
  const i = itemAviso(chave);
  return !!i && cfg[i.chave].sino;
};

/** O aviso sai por E-MAIL para esta pessoa? (o ADM liga; a pessoa só desliga o que o ADM deixou desligável) */
export function querEmail(cfg: ConfigResolvida, prefs: PrefsEmail, chave: string): boolean {
  const i = itemAviso(chave);
  if (!i) return false;
  const canal = cfg[i.chave];
  if (!canal.email) return false;
  if (!canal.desligavel) return true;
  return prefs.ligado && !prefs.desligados.includes(i.chave);
}

/** Os avisos que a pessoa vê no Perfil (os que o ADM manda por e-mail), com o estado de cada um. */
export function emailsDaPessoa(cfg: ConfigResolvida, prefs: PrefsEmail): { item: ItemCatalogoAviso; ligado: boolean; fixo: boolean }[] {
  return CATALOGO_AVISOS.filter((i) => cfg[i.chave].email).map((item) => ({ item, fixo: !cfg[item.chave].desligavel, ligado: querEmail(cfg, prefs, item.chave) }));
}
