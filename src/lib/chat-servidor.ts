import { getCloudflareContext } from "@opennextjs/cloudflare";

// O ENTREGADOR do chat ao vivo no servidor: a caixa pessoal de cada um (privada, conversa em grupo, os sinais) e o objeto do
// GRUPO (o chat do grupo). Fora do Worker (dev), sem os bindings: `null`.

type Ns = CloudflareEnv["CAIXA_NOTIFICACOES"];

function bindings(): { caixas: Ns; grupos: CloudflareEnv["PRESENCA_GRUPO"] } | null {
  try {
    const env = getCloudflareContext().env;
    return env.CAIXA_NOTIFICACOES && env.PRESENCA_GRUPO ? { caixas: env.CAIXA_NOTIFICACOES, grupos: env.PRESENCA_GRUPO } : null;
  } catch {
    return null;
  }
}

export const chatDisponivel = () => bindings() != null;

/** Entrega um texto às abas abertas de `dono` (a caixa pessoal) — devolve quantas o receberam (0 = sem o sistema aberto). */
export async function entregarNaCaixa(dono: number, corpo: string): Promise<number> {
  const b = bindings();
  if (!b) return 0;
  try {
    const r = await b.caixas.get(b.caixas.idFromName(`u${dono}`)).fetch("https://caixa/chat", { method: "POST", body: corpo });
    return ((await r.json()) as { n?: number }).n ?? 0;
  } catch {
    return 0;
  }
}

/** Repassa ao objeto do GRUPO (a mensagem a todas as abas; a "lida" a todas menos as de quem leu) — quantas receberam. */
export async function repassarNoGrupo(grupoId: number, msg: Record<string, unknown>): Promise<number> {
  const b = bindings();
  if (!b) return 0;
  try {
    const r = await b.grupos.get(b.grupos.idFromName(`g${grupoId}`)).fetch("https://presenca/repasse", { method: "POST", body: JSON.stringify(msg) });
    return ((await r.json()) as { n?: number }).n ?? 0;
  } catch {
    return 0;
  }
}
