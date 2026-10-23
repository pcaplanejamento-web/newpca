// HISTÓRICO DE ACESSO — núcleo PURO (testado em tests/acessos.test.ts): o formato de cada login e os rótulos da tela.

export type AcessoRegistro = {
  id: number;
  em: string;
  canal: string;
  navegador: string;
  ip: string | null;
  aparelho: string;
  novo: boolean;
  ultimoEm?: string | null;
  saidaEm?: string | null;
  saidaMotivo?: string | null;
};

/** Os motivos da SAÍDA de um acesso. */
export const ROTULO_SAIDA: Record<string, string> = { sair: "Saiu", inatividade: "Inatividade", vencida: "Sessão vencida" };

/** O começo do hash da sessão — o que liga o login à atividade e à saída (nunca o token). */
export const sessaoCurta = (tokenHash: string) => tokenHash.slice(0, 16);

const msDe = (iso: string | null | undefined) => {
  if (!iso) return Number.NaN;
  return Date.parse(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
};

/** Quanto tempo ficou: até a SAÍDA gravada; sem ela, até a última atividade (estimada); sem nada, desconhecido. */
export function duracaoAcesso(a: Pick<AcessoRegistro, "em" | "ultimoEm" | "saidaEm">): { ms: number; estimada: boolean } | null {
  const ini = msDe(a.em);
  if (!Number.isFinite(ini)) return null;
  const saida = msDe(a.saidaEm);
  if (Number.isFinite(saida)) return { ms: Math.max(0, saida - ini), estimada: false };
  const ultimo = msDe(a.ultimoEm);
  if (Number.isFinite(ultimo)) return { ms: Math.max(0, ultimo - ini), estimada: true };
  return null;
}

/** "menos de 1 min", "35 min", "2 h 05 min", "3 dias 4 h". */
export function textoDuracaoAcesso(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "menos de 1 min";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ${String(min % 60).padStart(2, "0")} min`;
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? "dia" : "dias"} ${h % 24} h`;
}

/** O tempo somado dos acessos que começaram nos últimos `dias` dias. */
export function tempoNosUltimosDias(lista: readonly Pick<AcessoRegistro, "em" | "ultimoEm" | "saidaEm">[], agoraMs: number, dias = 30): number {
  const desde = agoraMs - dias * 86_400_000;
  let total = 0;
  for (const a of lista) if (msDe(a.em) >= desde) total += duracaoAcesso(a)?.ms ?? 0;
  return total;
}

// ---------------------------------------------------------------------------
// CÓPIAS E CAPTURAS de tela
// ---------------------------------------------------------------------------
export const TIPOS_EVENTO = ["copia", "captura", "impressao"] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];
export const ROTULO_EVENTO: Record<TipoEvento, string> = { copia: "Cópia de texto", captura: "Captura de tela", impressao: "Impressão" };
/** O texto copiado que fica guardado. */
export const MAX_TEXTO_EVENTO = 500;
/** Quantos eventos ficam por pessoa (os mais antigos saem) e por quantos dias. */
export const MAX_EVENTOS = 500;
export const DIAS_EVENTOS = 180;

export type EventoRegistro = {
  id: number;
  em: string;
  tipo: string;
  rota: string;
  tela: string;
  itens: string;
  texto: string | null;
  tamanho: number;
  origem: string;
  navegador: string;
  ip: string | null;
};

/** O texto copiado limpo (sem controles, espaços juntos) e cortado — e o tamanho original. */
export function textoDoEvento(bruto: string | null | undefined): { texto: string | null; tamanho: number } {
  if (!bruto) return { texto: null, tamanho: 0 };
  // biome-ignore lint/suspicious/noControlCharactersInRegex: os controles saem do texto guardado
  const limpo = bruto.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim();
  return { texto: limpo ? limpo.slice(0, MAX_TEXTO_EVENTO) : null, tamanho: bruto.length };
}

/** Atalho de CAPTURA de tela no teclado (PrtScn, Win+Shift+S, Cmd+Shift+3/4/5). */
export function atalhoDeCaptura(e: { key: string; shiftKey: boolean; metaKey: boolean }): boolean {
  if (e.key === "PrintScreen") return true;
  if (e.shiftKey && e.metaKey && ["3", "4", "5", "s", "S"].includes(e.key)) return true;
  return false;
}

export const ROTULO_CANAL: Record<string, string> = { senha: "Senha", google: "Google" };

/** "Chrome no Windows · aparelho A1B2C3" — o aparelho distingue dois iguais. */
export const rotuloDispositivo = (a: Pick<AcessoRegistro, "navegador" | "aparelho">) => `${a.navegador} · aparelho ${a.aparelho.toUpperCase()}`;

/** Há quanto tempo (o último acesso): "agora", "há 5 min", "há 3 h", "há 2 dias". */
export function haQuanto(iso: string | null | undefined, agoraMs: number): string {
  if (!iso) return "nunca";
  const t = Date.parse(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
  if (!Number.isFinite(t)) return "—";
  const min = Math.max(0, Math.floor((agoraMs - t) / 60_000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} ${d === 1 ? "dia" : "dias"}`;
}

/** Quantos aparelhos diferentes aparecem no histórico. */
export const aparelhosDistintos = (lista: readonly Pick<AcessoRegistro, "aparelho">[]) => new Set(lista.map((a) => a.aparelho)).size;
