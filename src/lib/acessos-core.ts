// HISTÓRICO DE ACESSO — núcleo PURO (testado em tests/acessos.test.ts): o formato de cada login e os rótulos da tela.

export type AcessoRegistro = { id: number; em: string; canal: string; navegador: string; ip: string | null; aparelho: string; novo: boolean };

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
