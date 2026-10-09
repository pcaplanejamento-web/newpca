import { getCloudflareContext } from "@opennextjs/cloudflare";
import { MAX_AO_VIVO } from "./ao-vivo-core";
import { depoisDaResposta } from "./segundo-plano";

/**
 * AVISA AO VIVO as abas abertas das pessoas (o Durable Object `CaixaNotificacoes` de cada uma) — depois da resposta,
 * best-effort. Sem o binding (desenvolvimento, testes), não faz nada: a tela confere pela consulta de reserva.
 */
export function avisarAoVivo(usuarioIds: number[]) {
  let caixas: CloudflareEnv["CAIXA_NOTIFICACOES"] | undefined;
  try {
    caixas = getCloudflareContext().env.CAIXA_NOTIFICACOES;
  } catch {
    return;
  }
  if (!caixas) return;
  const alvo = [...new Set(usuarioIds)].slice(0, MAX_AO_VIVO);
  if (!alvo.length) return;
  const ns = caixas;
  depoisDaResposta(Promise.all(alvo.map((id) => ns.get(ns.idFromName(`u${id}`)).fetch("https://caixa/ping", { method: "POST" }))), "ao-vivo");
}

/** AGENDA o aviso ao vivo de uma pessoa para um instante (o aviso ADIADO volta ao sino na hora — o alarme da caixa). */
export function agendarAoVivo(usuarioId: number, em: number) {
  let caixas: CloudflareEnv["CAIXA_NOTIFICACOES"] | undefined;
  try {
    caixas = getCloudflareContext().env.CAIXA_NOTIFICACOES;
  } catch {
    return;
  }
  if (!caixas) return;
  depoisDaResposta(caixas.get(caixas.idFromName(`u${usuarioId}`)).fetch(`https://caixa/alarme?em=${Math.round(em)}`, { method: "POST" }), "ao-vivo");
}
