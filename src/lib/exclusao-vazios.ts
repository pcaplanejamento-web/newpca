import { eq } from "drizzle-orm";
import { dfdProtocolos } from "@/db/schema";
import { registrarAuditoria } from "./auditoria";
import type { Ator as AtorAuditoria } from "./auditoria-core";
import { getDb } from "./db";
import { excluirDfd } from "./dfd";
import { consultaDfdsRestantes } from "./mesa-excluidos-sql";
import { excluirProtocolo } from "./protocolo";

type Ator = AtorAuditoria & { id: number; nome: string };

/**
 * NADA FICA VAZIO NA MESA: o protocolo que ficou sem nenhum DFD é excluído (vai à lixeira com o motivo "Ficou vazio").
 * Chamado DEPOIS da exclusão de um DFD (a contagem é a do banco, já sem ele). Devolve se excluiu.
 */
export async function excluirProtocoloSeVazio(protocoloId: number | null, u: Ator): Promise<boolean> {
  if (protocoloId == null) return false;
  const db = getDb();
  const [[p], [c]] = await Promise.all([
    db.select({ numero: dfdProtocolos.numero }).from(dfdProtocolos).where(eq(dfdProtocolos.id, protocoloId)).limit(1),
    consultaDfdsRestantes(db, protocoloId),
  ]);
  if (!p || Number(c?.n ?? 1) > 0) return false;
  await excluirProtocolo(protocoloId, u.id, { id: u.id, nome: u.nome }, "esvaziado");
  await registrarAuditoria({
    usuario: u,
    acao: "excluir",
    entidade: "protocolo",
    entidadeId: protocoloId,
    resumo: `Protocolo ${p.numero} excluído: ficou sem DFDs`,
    protocoloId,
    origem: "exclusao",
  });
  return true;
}

/**
 * O DFD que ficou SEM ITENS é excluído (lixeira, motivo "Ficou vazio") e, se era o último do protocolo, o protocolo
 * também. Devolve se o protocolo saiu junto.
 */
export async function excluirDfdEsvaziado(d: { id: number; numero: string; protocoloId: number | null }, u: Ator): Promise<{ protocoloExcluido: boolean }> {
  await excluirDfd(d.id, u.id, { quem: { id: u.id, nome: u.nome }, motivo: "esvaziado" });
  await registrarAuditoria({
    usuario: u,
    acao: "excluir",
    entidade: "dfd",
    entidadeId: d.id,
    resumo: `DFD ${d.numero} excluído: ficou sem itens`,
    protocoloId: d.protocoloId,
    origem: "exclusao",
  });
  return { protocoloExcluido: await excluirProtocoloSeVazio(d.protocoloId, u) };
}
