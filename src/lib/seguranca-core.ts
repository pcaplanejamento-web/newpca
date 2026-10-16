// SEGURANÇA DO ACESSO configurável pelo ADM (Configurações → Segurança) — núcleo PURO (testado em tests/seguranca.test.ts).
// Blob `configuracoes`, chave `seguranca`. Padrão: sessão sem limite de inatividade (o comportamento de antes) e os alertas
// de login suspeito ligados.

export type ConfigSeguranca = {
  /** Minutos sem atividade até encerrar a sessão (0 = não encerra). */
  inatividadeMin: number;
  /** Avisa no sino dos ADMs (e da pessoa) o login de um aparelho novo. */
  alertaAparelho: boolean;
  /** Avisa no sino dos ADMs a conta bloqueada por senhas erradas. */
  alertaFalhas: boolean;
};

export const OPCOES_INATIVIDADE = [0, 15, 30, 60, 120, 240, 480] as const;
export const SEGURANCA_PADRAO: ConfigSeguranca = { inatividadeMin: 0, alertaAparelho: true, alertaFalhas: true };

export function lerConfigSeguranca(v: unknown): ConfigSeguranca {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const min = Number(o.inatividadeMin);
  return {
    inatividadeMin: (OPCOES_INATIVIDADE as readonly number[]).includes(min) ? min : 0,
    alertaAparelho: typeof o.alertaAparelho === "boolean" ? o.alertaAparelho : true,
    alertaFalhas: typeof o.alertaFalhas === "boolean" ? o.alertaFalhas : true,
  };
}

export function rotuloInatividade(min: number): string {
  if (!min) return "Não encerra";
  return min < 60 ? `${min} minutos` : `${min / 60} ${min === 60 ? "hora" : "horas"}`;
}

/** A sessão parada além do limite (sem a data = conta como agora: nunca derruba por dado faltando). */
export function sessaoInativa(vistoEm: string | null | undefined, agoraMs: number, inatividadeMin: number): boolean {
  if (!inatividadeMin || !vistoEm) return false;
  const t = Date.parse(vistoEm.includes("T") ? vistoEm : `${vistoEm.replace(" ", "T")}Z`);
  return Number.isFinite(t) && agoraMs - t > inatividadeMin * 60_000;
}

/** Gravar a atividade de novo? No máximo a cada 1/4 do limite (≤ 5 min) — poucas escritas. */
export function renovarAtividade(vistoEm: string | null | undefined, agoraMs: number, inatividadeMin: number): boolean {
  if (!vistoEm) return true;
  const t = Date.parse(vistoEm.includes("T") ? vistoEm : `${vistoEm.replace(" ", "T")}Z`);
  if (!Number.isFinite(t)) return true;
  const passo = inatividadeMin ? Math.min(5, inatividadeMin / 4) : 5;
  return agoraMs - t >= passo * 60_000;
}

/** Os aparelhos conhecidos de uma pessoa (preferência `seguranca:aparelhos`) — até `MAX_APARELHOS`, o mais recente primeiro. */
export const MAX_APARELHOS = 10;
export function lerAparelhos(v: unknown): string[] {
  const ids = v && typeof v === "object" ? (v as { ids?: unknown }).ids : null;
  return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string" && /^[0-9a-f]{16,64}$/.test(x)).slice(0, MAX_APARELHOS) : [];
}

/** O login de um aparelho: novo = há aparelhos conhecidos e este não está (o 1º aparelho nunca alerta). */
export function avaliarAparelho(conhecidos: readonly string[], aparelho: string): { novo: boolean; lista: string[] } {
  const novo = conhecidos.length > 0 && !conhecidos.includes(aparelho);
  return { novo, lista: [aparelho, ...conhecidos.filter((x) => x !== aparelho)].slice(0, MAX_APARELHOS) };
}

/** Um resumo curto do navegador (para o aviso — nunca o cabeçalho inteiro). */
export function resumoNavegador(ua: string | null | undefined): string {
  const s = ua ?? "";
  const nav = /Edg\//.test(s) ? "Edge" : /OPR\//.test(s) ? "Opera" : /Firefox\//.test(s) ? "Firefox" : /Chrome\//.test(s) ? "Chrome" : /Safari\//.test(s) ? "Safari" : "Navegador";
  const so = /Android/.test(s) ? "Android" : /iPhone|iPad/.test(s) ? "iOS" : /Windows/.test(s) ? "Windows" : /Mac OS X/.test(s) ? "macOS" : /Linux/.test(s) ? "Linux" : "";
  return so ? `${nav} no ${so}` : nav;
}
