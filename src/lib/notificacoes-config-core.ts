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
  { chave: "concluida", rotulo: "Tarefa concluída", descricao: "Uma tarefa que a pessoa observa foi concluída.", grupo: "Tarefas", padrao: c(true, false) },
  { chave: "protocolo", rotulo: "Protocolo designado", descricao: "A pessoa passou a ser a responsável por um protocolo da Mesa.", grupo: "Mesa e PCA", padrao: c(true, true) },
  { chave: "situacao", rotulo: "Protocolo atualizado", descricao: "Mudou a situação ou o protocolo da pessoa foi reenviado.", grupo: "Mesa e PCA", padrao: c(true, false) },
  { chave: "pca", rotulo: "Protocolo no PCA", descricao: "Um protocolo da pessoa foi enviado, incorporado ou devolvido no PCA.", grupo: "Mesa e PCA", padrao: c(true, false) },
  { chave: "centi", rotulo: "Automação Centi", descricao: "Terminou (ou falhou) um lote da Automação que a pessoa iniciou.", grupo: "Administração", padrao: c(true, false) },
  { chave: "comunicado", rotulo: "Comunicado", descricao: "Um aviso enviado pelo administrador a todos ou a um grupo.", grupo: "Administração", padrao: c(true, false, true) },
  { chave: "versao", rotulo: "Nova versão do sistema", descricao: "Aos administradores: o que mudou em cada versão nova, com o caminho até onde mudou.", grupo: "Administração", padrao: c(true, false) },
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

// ─── PREFERÊNCIA DA PESSOA (e-mail — `preferencias_tabela`, chave `email:notificacoes`) ─────────────────────────────

export const DESTINOS_EMAIL = ["institucional", "google"] as const;
export type DestinoEmail = (typeof DESTINOS_EMAIL)[number];
/** IMEDIATO = cada aviso no seu e-mail; RESUMO = um e-mail por dia, no horário escolhido, com tudo junto. */
export const MODOS_EMAIL = ["imediato", "resumo"] as const;
export type ModoEmail = (typeof MODOS_EMAIL)[number];
/** O horário de SILÊNCIO (Brasília): o e-mail imediato que cair nele espera o fim. */
export type Silencio = { inicio: string; fim: string };
/** `ligado: false` = desliga TODOS os desligáveis; `desligados` = os que a pessoa tirou. */
export type PrefsEmail = { ligado: boolean; desligados: ChaveAviso[]; destino: DestinoEmail; modo: ModoEmail; horaResumo: string; silencio: Silencio | null };
export const PREFS_EMAIL_PADRAO: PrefsEmail = { ligado: true, desligados: [], destino: "institucional", modo: "imediato", horaResumo: "07:30", silencio: null };

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const hora = (v: unknown, padrao: string) => (typeof v === "string" && HORA.test(v) ? v : padrao);

/**
 * Lê a preferência gravada (qualquer JSON → válido). Compatível com o formato ANTERIOR (`tipos` = a lista dos que a pessoa
 * QUERIA): o que ficou de fora vira desligado.
 */
export function lerPrefsEmail(valor: unknown): PrefsEmail {
  if (!valor || typeof valor !== "object") return { ...PREFS_EMAIL_PADRAO, desligados: [] };
  const v = valor as Record<string, unknown>;
  let desligados: ChaveAviso[] = [];
  if (Array.isArray(v.desligados)) desligados = CHAVES_AVISO.filter((k) => (v.desligados as unknown[]).includes(k));
  else if (Array.isArray(v.tipos)) desligados = TIPOS_NOTIFICACAO.filter((k) => !(v.tipos as unknown[]).includes(k));
  const sil = v.silencio && typeof v.silencio === "object" ? (v.silencio as Record<string, unknown>) : null;
  return {
    ligado: typeof v.ligado === "boolean" ? v.ligado : true,
    desligados,
    destino: v.destino === "google" ? "google" : "institucional",
    modo: v.modo === "resumo" ? "resumo" : "imediato",
    horaResumo: hora(v.horaResumo, PREFS_EMAIL_PADRAO.horaResumo),
    silencio: sil && HORA.test(String(sil.inicio)) && HORA.test(String(sil.fim)) && sil.inicio !== sil.fim ? { inicio: String(sil.inicio), fim: String(sil.fim) } : null,
  };
}

/** O instante como o SQLite grava ("AAAA-MM-DD HH:MM:SS", UTC). */
export const sqlUtc = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");
const BRASILIA_MIN = 180;
const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));

/** O PRÓXIMO instante (UTC, ms) em que o relógio de Brasília marca `hh:mm` (depois de `agora`). */
export function proximoHorario(agora: number, hhmm: string): number {
  const local = agora - BRASILIA_MIN * 60_000;
  const diaLocal = Math.floor(local / 86_400_000) * 86_400_000;
  let alvo = diaLocal + minutos(hhmm) * 60_000;
  if (alvo <= local) alvo += 86_400_000;
  return alvo + BRASILIA_MIN * 60_000;
}

/** O relógio de Brasília está dentro do silêncio (que pode virar a noite: 20:00 → 07:00)? */
export function noSilencio(agora: number, s: Silencio): boolean {
  const local = Math.floor(((agora / 60_000 - BRASILIA_MIN) % 1440) + 1440) % 1440;
  const i = minutos(s.inicio);
  const f = minutos(s.fim);
  return i < f ? local >= i && local < f : local >= i || local < f;
}

/**
 * QUANDO o e-mail desta pessoa pode sair (UTC "AAAA-MM-DD HH:MM:SS"; `null` = já): no RESUMO, o próximo horário do resumo;
 * no IMEDIATO dentro do silêncio, o fim do silêncio. O obrigatório (não desligável) não espera.
 */
export function emailAposPara(prefs: PrefsEmail, agora: number, obrigatorio = false): string | null {
  if (obrigatorio) return null;
  if (prefs.modo === "resumo") return sqlUtc(proximoHorario(agora, prefs.horaResumo));
  if (prefs.silencio && noSilencio(agora, prefs.silencio)) return sqlUtc(proximoHorario(agora, prefs.silencio.fim));
  return null;
}

// ─── PREFERÊNCIA DA PESSOA (sino — `preferencias_tabela`, chave `notificacoes:pessoa`) ──────────────────────────────

export const CHAVE_PREF_PESSOA = "notificacoes:pessoa";
/** Os avisos que nem o silenciar nem a pessoa tiram do sino (falam DIRETO com ela). */
export const AVISOS_DIRETOS: readonly ChaveAviso[] = ["atribuida", "mencionada", "convite", "protocolo", "cadastro", "comunicado"];
/**
 * O que a pessoa escolheu para o SINO: os tipos que ela não quer (só os não diretos), as TAREFAS e os QUADROS silenciados
 * (nada além dos diretos chega deles) e os alertas do APARELHO — som e a notificação do sistema.
 */
export type PrefsPessoa = { sinoDesligados: ChaveAviso[]; tarefas: number[]; quadros: number[]; som: boolean; sistema: boolean };
export const PREFS_PESSOA_PADRAO: PrefsPessoa = { sinoDesligados: [], tarefas: [], quadros: [], som: false, sistema: false };
/** Tantos silenciados no máximo (cada lista). */
export const MAX_SILENCIADOS = 200;

const ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is number => Number.isInteger(x) && x > 0))].slice(-MAX_SILENCIADOS) : []);
export function lerPrefsPessoa(valor: unknown): PrefsPessoa {
  if (!valor || typeof valor !== "object") return { ...PREFS_PESSOA_PADRAO, sinoDesligados: [], tarefas: [], quadros: [] };
  const v = valor as Record<string, unknown>;
  return {
    sinoDesligados: Array.isArray(v.sinoDesligados) ? CHAVES_AVISO.filter((k) => !AVISOS_DIRETOS.includes(k) && (v.sinoDesligados as unknown[]).includes(k)) : [],
    tarefas: ids(v.tarefas),
    quadros: ids(v.quadros),
    som: v.som === true,
    sistema: v.sistema === true,
  };
}

/** O aviso NÃO chega ao sino desta pessoa (tipo desligado por ela, tarefa ou quadro silenciados)? O direto sempre chega. */
export function silenciado(p: PrefsPessoa, n: { tipo: string; tarefaId?: number | null; quadroId?: number | null }): boolean {
  if ((AVISOS_DIRETOS as readonly string[]).includes(n.tipo)) return false;
  if ((p.sinoDesligados as readonly string[]).includes(n.tipo)) return true;
  return (n.tarefaId != null && p.tarefas.includes(n.tarefaId)) || (n.quadroId != null && p.quadros.includes(n.quadroId));
}

// ─── RETENÇÃO (o ADM — blob `configuracoes`, chave `notificacoesRetencao`) ────────────────────────────────────────

/** Quanto tempo os avisos ficam disponíveis e se o sistema os LIMPA sozinho. */
export type Retencao = { auto: boolean; lidasDias: number; naoLidasDias: number; teto: number };
export const RETENCAO_PADRAO: Retencao = { auto: true, lidasDias: 30, naoLidasDias: 90, teto: 200 };
export const LIMITES_RETENCAO = { dias: [1, 365], teto: [20, 1000] } as const;
const entre = (v: unknown, [min, max]: readonly [number, number], padrao: number) => (Number.isInteger(v) ? Math.min(max, Math.max(min, v as number)) : padrao);
export function lerRetencao(valor: unknown): Retencao {
  const v = valor && typeof valor === "object" ? (valor as Record<string, unknown>) : {};
  const lidas = entre(v.lidasDias, LIMITES_RETENCAO.dias, RETENCAO_PADRAO.lidasDias);
  return {
    auto: typeof v.auto === "boolean" ? v.auto : RETENCAO_PADRAO.auto,
    lidasDias: lidas,
    // As não lidas nunca saem antes das lidas.
    naoLidasDias: Math.max(lidas, entre(v.naoLidasDias, LIMITES_RETENCAO.dias, RETENCAO_PADRAO.naoLidasDias)),
    teto: entre(v.teto, LIMITES_RETENCAO.teto, RETENCAO_PADRAO.teto),
  };
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
