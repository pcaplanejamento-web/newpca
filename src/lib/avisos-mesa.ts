import type { UsuarioSessao } from "./auth";
import { atorDe, notificar } from "./notificacoes";
import { nomeExibicao } from "./pessoa";

/**
 * Os AVISOS da Mesa e do PCA no sino (best-effort — nunca derrubam a gravação): o protocolo DESIGNADO à pessoa e o que
 * acontece com os protocolos dela no PCA. O link abre o protocolo na Mesa em que ele está.
 */

type ProtocoloAviso = { id: number; numero: string; assunto?: string | null; pcaId?: number | null };

/** O link que abre o protocolo na Mesa em que ele está (a do sistema ou a do PCA). */
export const linkProtocolo = (p: { id: number; pcaId?: number | null }) => (p.pcaId ? `/painel/mesa?pca=${p.pcaId}&abrir=protocolo:${p.id}` : `/painel/mesa?abrir=protocolo:${p.id}`);

const textoProtocolo = (p: ProtocoloAviso) => `Protocolo ${p.numero}${p.assunto ? ` · ${p.assunto}` : ""}`;

/**
 * "Você é o responsável": UM aviso por pessoa designada — com vários protocolos de uma vez (a massa), um aviso só com a
 * contagem (o link abre o 1º).
 */
export async function avisarResponsavelProtocolo(u: UsuarioSessao, designacoes: { responsavelId: number; protocolo: ProtocoloAviso }[]) {
  const porPessoa = new Map<number, ProtocoloAviso[]>();
  for (const d of designacoes) porPessoa.set(d.responsavelId, [...(porPessoa.get(d.responsavelId) ?? []), d.protocolo]);
  await notificar(
    [...porPessoa].map(([usuarioId, ps]) => ({
      usuarioId,
      tipo: "protocolo" as const,
      titulo: ps.length === 1 ? `${nomeExibicao(u)} designou você como responsável` : `${nomeExibicao(u)} designou ${ps.length} protocolos a você`,
      texto: ps.length === 1 ? textoProtocolo(ps[0]) : ps.slice(0, 5).map((p) => p.numero).join(", ") + (ps.length > 5 ? "…" : ""),
      link: linkProtocolo(ps[0]),
      ...atorDe(u),
    })),
    u.id,
  );
}

const ACAO_PCA = { enviar: "enviado ao", incorporar: "incorporado ao", devolver: "devolvido do" } as const;

/** O protocolo do responsável foi enviado / incorporado / devolvido no PCA — um aviso por responsável. */
export async function avisarPcaProtocolos(u: UsuarioSessao, acao: keyof typeof ACAO_PCA, pca: { id: number; nome: string }, protocolos: (ProtocoloAviso & { responsavelId: number | null })[]) {
  const porPessoa = new Map<number, ProtocoloAviso[]>();
  for (const p of protocolos) if (p.responsavelId) porPessoa.set(p.responsavelId, [...(porPessoa.get(p.responsavelId) ?? []), p]);
  await notificar(
    [...porPessoa].map(([usuarioId, ps]) => ({
      usuarioId,
      tipo: "pca" as const,
      titulo: ps.length === 1 ? `Protocolo ${ps[0].numero} ${ACAO_PCA[acao]} PCA` : `${ps.length} protocolos seus ${ACAO_PCA[acao].replace("enviado", "enviados").replace("incorporado", "incorporados").replace("devolvido", "devolvidos")} PCA`,
      texto: pca.nome,
      link: linkProtocolo({ id: ps[0].id, pcaId: acao === "devolver" ? null : pca.id }),
      ...atorDe(u),
    })),
    u.id,
  );
}

/** A SITUAÇÃO do protocolo mudou, ou o protocolo foi REENVIADO: o responsável sabe (um aviso por pessoa). */
export async function avisarProtocoloAtualizado(u: UsuarioSessao, mudancas: { responsavelId: number | null; protocolo: ProtocoloAviso; oQue: string }[]) {
  const porPessoa = new Map<number, typeof mudancas>();
  for (const m of mudancas) if (m.responsavelId) porPessoa.set(m.responsavelId, [...(porPessoa.get(m.responsavelId) ?? []), m]);
  await notificar(
    [...porPessoa].map(([usuarioId, ms]) => ({
      usuarioId,
      tipo: "situacao" as const,
      titulo: ms.length === 1 ? `Protocolo ${ms[0].protocolo.numero}: ${ms[0].oQue}` : `${ms.length} protocolos seus atualizados`,
      texto: ms.length === 1 ? (ms[0].protocolo.assunto ?? null) : ms.slice(0, 5).map((m) => `${m.protocolo.numero} (${m.oQue})`).join(", "),
      link: linkProtocolo(ms[0].protocolo),
      ...atorDe(u),
    })),
    u.id,
  );
}
