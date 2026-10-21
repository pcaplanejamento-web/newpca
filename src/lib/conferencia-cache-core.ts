/**
 * CONFERÊNCIA GUARDADA (núcleo PURO) — o Estado de cada DFD/protocolo da Mesa é calculado UMA vez e guardado com a sua
 * ASSINATURA DE ENTRADA (tudo o que a conferência da lista lê). O guardado só vale com a MESMA assinatura: qualquer
 * entrada que mude — o DFD gravado, a unidade, o protocolo, o assunto, o ano, as regras do ADM, os órgãos ou os
 * responsáveis da unidade — invalida sozinha, sem depender de nenhum ponto de gravação.
 */
import type { EstadoDfd, EstadoProtocolo, ResumoEstado } from "./dfd-tratamento";

/** O Estado de UM DFD da lista (a resposta de `POST /api/dfd/conferencia`). */
export type ConfLinha = { id: number; estado: EstadoDfd; resumo: ResumoEstado | null; validacao: "auto" | "equipe" | null };
/** O Estado AGREGADO de UM protocolo (a resposta de `POST /api/protocolo/conferencia`). */
export type ConfProto = { id: number; estado: EstadoProtocolo; resumo: ResumoEstado | null; dfdsComErro?: number; dfdsEmAtencao?: number };
/** Os Estados guardados que a Mesa já recebe ao abrir (só os que conferem com a assinatura atual). */
export type ConfsGuardadas = { dfds: ConfLinha[]; protocolos: ConfProto[] };

/** Os campos de um DFD que entram na assinatura (os da lista e os do DFD completo — o mesmo tipo-base). */
export type BaseDfdCampos = {
  id: number;
  atualizadoEm: string | null;
  reparticaoId: number | null;
  protocoloId: number | null;
  protocoloAssunto: string | null;
  anoPca: number | null;
  protocoloAnoPca: number | null;
  totalItens: number | null;
};
/** Os campos de um protocolo que entram na assinatura. */
export type BaseProtocoloCampos = {
  id: number;
  dfdsAtualizadoEm: string | null;
  totalDfds: number;
  valorTotal: number | null;
  sobrescritos: number;
  valorSobrescritos: number | null;
  valorCapa: number | null;
  assunto: string | null;
  anoPca: number | null;
};

const v = (x: unknown) => (x == null ? "" : String(x));

/** A base de um DFD — texto puro (muda a cada gravação; guardada sem hash, então nunca colide). */
export const baseDfd = (d: BaseDfdCampos) =>
  [d.id, d.atualizadoEm, d.reparticaoId, d.protocoloId, d.protocoloAssunto, d.anoPca, d.protocoloAnoPca, d.totalItens].map(v).join("|");
/** A base de um protocolo (a capa, o assunto, o ano e o agregado dos DFDs). */
export const baseProtocolo = (p: BaseProtocoloCampos) =>
  [p.id, p.dfdsAtualizadoEm, p.totalDfds, p.valorTotal, p.sobrescritos, p.valorSobrescritos, p.valorCapa, p.assunto, p.anoPca].map(v).join("|");

/** SHA-256 em hex (Web Crypto — existe no Worker e no Node). */
export async function sha256(texto: string): Promise<string> {
  const b = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto)));
  let s = "";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return s;
}

/** O CONTEXTO da conferência (as regras do ADM e os órgãos) — o hash do que a conferência realmente usou. */
export const chaveContexto = (regras: unknown, orgaos: unknown) => sha256(JSON.stringify([regras ?? null, orgaos ?? null]));

/** A UNIDADE efetiva de um DFD (o órgão e os responsáveis que conferem a assinatura). */
export type UnidadeAssinatura = { id: number; orgaoId: number | null; responsaveis: unknown };
export const chaveUnidade = (u: UnidadeAssinatura | null | undefined) =>
  u ? sha256(JSON.stringify([u.id, u.orgaoId ?? null, u.responsaveis ?? null])) : Promise.resolve("-");

/** Os hashes de várias unidades de uma vez (`id → hash`). */
export async function chavesUnidades(us: UnidadeAssinatura[]): Promise<Map<number, string>> {
  const pares = await Promise.all(us.map(async (u) => [u.id, await chaveUnidade(u)] as const));
  return new Map(pares);
}

/** A ASSINATURA de um DFD: a base + o contexto + a unidade efetiva. */
export const assinaturaDfd = (d: BaseDfdCampos, ctx: string, unidades: Map<number, string>) =>
  `${baseDfd(d)}#${ctx}#${d.reparticaoId == null ? "-" : (unidades.get(d.reparticaoId) ?? "?")}`;

/** A ASSINATURA de um protocolo: a base + o contexto + as assinaturas dos DFDs dele (em ordem). */
export async function assinaturaProtocolo(p: BaseProtocoloCampos, ctx: string, assinaturasDfds: string[]): Promise<string> {
  return `${baseProtocolo(p)}#${ctx}#${await sha256([...assinaturasDfds].sort().join("\n"))}`;
}

/** Um DFD com unidade que não está entre as unidades conhecidas NÃO tem assinatura confiável (nunca usa o guardado). */
export const assinaturaConfiavel = (a: string) => !a.endsWith("#?");
