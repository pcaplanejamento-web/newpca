import {
  assinaturaConfiavel,
  assinaturaDfd,
  assinaturaProtocolo,
  type BaseDfdCampos,
  type BaseProtocoloCampos,
  type ConfLinha,
  type ConfProto,
  type ConfsGuardadas,
  chavesUnidades,
  chaveContexto,
} from "./conferencia-cache-core";
import { comandosGravarConferencias, type ConferenciaGravar, consultaConferencias, type TipoConferencia } from "./conferencia-cache-sql";
import { getDb } from "./db";
import { unidadesConferencia } from "./reparticoes";

/** As conferências guardadas dos alvos (`id → {assinatura, resultado}`). Falhou = nenhuma (calcula como antes). */
export async function lerGuardadas(tipo: TipoConferencia, ids: number[]): Promise<Map<number, { assinatura: string; resultado: string }>> {
  if (ids.length === 0) return new Map();
  try {
    const linhas = await consultaConferencias(getDb(), tipo, ids);
    return new Map(linhas.map((l) => [l.alvoId, { assinatura: l.assinatura, resultado: l.resultado }]));
  } catch {
    return new Map();
  }
}

/** Grava as conferências calculadas — BEST-EFFORT (a resposta nunca depende disso). Só as de assinatura confiável. */
export async function gravarGuardadas(tipo: TipoConferencia, linhas: ConferenciaGravar[]): Promise<void> {
  const validas = linhas.filter((l) => assinaturaConfiavel(l.assinatura));
  if (validas.length === 0) return;
  try {
    const db = getDb();
    const [primeiro, ...resto] = comandosGravarConferencias(db, tipo, validas);
    await db.batch([primeiro, ...resto]);
  } catch (e) {
    console.error("[conferencia-guardada] falha ao gravar", e);
  }
}

/** O guardado vale? (a MESMA assinatura; o JSON lido sem erro). */
export function guardadoValido<T>(g: { assinatura: string; resultado: string } | undefined, assinatura: string): T | null {
  if (!g || g.assinatura !== assinatura || !assinaturaConfiavel(assinatura)) return null;
  try {
    return JSON.parse(g.resultado) as T;
  } catch {
    return null;
  }
}

type DfdDaMesa = BaseDfdCampos;
type ProtocoloDaMesa = BaseProtocoloCampos;

/**
 * Os Estados GUARDADOS que a Mesa já recebe ao abrir: só das linhas que a pessoa VÊ (as listas já redigidas) e só os que
 * conferem com a assinatura ATUAL (as mesmas regras, órgãos e responsáveis que a rota de conferência usa). Os demais o
 * cliente pede como sempre. Falhou = nada (a Mesa confere como antes).
 */
export async function confsDaMesa(protocolos: ProtocoloDaMesa[], dfds: DfdDaMesa[], regras: unknown, orgaos: unknown): Promise<ConfsGuardadas> {
  try {
    if (protocolos.length === 0 && dfds.length === 0) return { dfds: [], protocolos: [] };
    const [ctx, unidades, gd, gp] = await Promise.all([
      chaveContexto(regras, orgaos),
      unidadesConferencia(dfds.map((d) => d.reparticaoId)),
      lerGuardadas(
        "dfd",
        dfds.map((d) => d.id),
      ),
      lerGuardadas(
        "protocolo",
        protocolos.map((p) => p.id),
      ),
    ]);
    const hashes = await chavesUnidades(unidades);
    const sigDfd = new Map(dfds.map((d) => [d.id, assinaturaDfd(d, ctx, hashes)]));
    const outDfds: ConfLinha[] = [];
    for (const d of dfds) {
      const r = guardadoValido<ConfLinha>(gd.get(d.id), sigDfd.get(d.id) ?? "");
      if (r) outDfds.push({ ...r, id: d.id });
    }
    const porProtocolo = new Map<number, string[]>();
    for (const d of dfds) if (d.protocoloId != null) (porProtocolo.get(d.protocoloId) ?? porProtocolo.set(d.protocoloId, []).get(d.protocoloId))?.push(sigDfd.get(d.id) ?? "");
    const outProtos: ConfProto[] = [];
    for (const p of protocolos) {
      const g = gp.get(p.id);
      if (!g) continue;
      const r = guardadoValido<ConfProto>(g, await assinaturaProtocolo(p, ctx, porProtocolo.get(p.id) ?? []));
      if (r) outProtos.push({ ...r, id: p.id });
    }
    return { dfds: outDfds, protocolos: outProtos };
  } catch {
    return { dfds: [], protocolos: [] };
  }
}
