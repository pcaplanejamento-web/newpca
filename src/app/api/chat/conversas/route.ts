import { exigirUsuario } from "@/lib/api-auth";
import { conversaDaChave, idDaConversa, lerIds, VALIDADE_CHAT_MS } from "@/lib/chat-core";
import { consultaConversasChat, consultaResumoGrupo } from "@/lib/chat-sql";
import { getDb } from "@/lib/db";
import { erro, ok } from "@/lib/http";
import { ehMembroDoGrupo, getConfigChat } from "@/lib/presenca";
import { pessoasPorIds } from "@/lib/usuarios";

export const dynamic = "force-dynamic";

/**
 * As CONVERSAS GUARDADAS da pessoa (últimos 7 dias): as privadas e as em grupo (a última mensagem, as não lidas, o nome e os
 * membros) e, com `?grupo=`, o chat do grupo ativo (a última e as não lidas) — o chat volta igual depois de recarregar.
 */
export async function GET(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const cfg = await getConfigChat();
  if (!cfg || (!cfg.grupo && !cfg.privado)) return erro("O chat está desligado pelo administrador.", 409);
  const grupo = Number(new URL(req.url).searchParams.get("grupo"));
  const desde = Date.now() - VALIDADE_CHAT_MS;
  const db = getDb();
  const [linhas, resumo] = await Promise.all([
    cfg.privado ? consultaConversasChat(db, a.u.id, desde) : Promise.resolve([]),
    cfg.grupo && Number.isInteger(grupo) && grupo > 0 && (await ehMembroDoGrupo(a.u.id, grupo)) ? consultaResumoGrupo(db, `g${grupo}`, a.u.id, desde) : Promise.resolve([]),
  ]);
  const conversas = linhas.flatMap((l) => {
    const c = conversaDaChave(l.conversa, a.u.id, null);
    if (!c) return [];
    let membros: number[] | null = null;
    try {
      membros = l.membros ? lerIds(JSON.parse(l.membros)) : null;
    } catch {
      membros = null;
    }
    return [
      {
        conversa: c,
        nome: l.nome ?? "",
        membros: membros ?? [],
        naoLidas: Number(l.naoLidas) || 0,
        ultima: l.texto != null && l.em != null ? { de: Number(l.de), texto: l.texto, em: Number(l.em) } : null,
      },
    ];
  });
  const g = resumo[0];
  const grupoResumo = g ? { naoLidas: Number(g.naoLidas) || 0, ultima: { de: g.de, texto: g.texto, em: g.em } } : null;
  const ids = new Set<number>();
  for (const c of conversas) {
    const outro = idDaConversa(c.conversa);
    if (outro != null) ids.add(outro);
    for (const m of c.membros) ids.add(m);
    if (c.ultima) ids.add(c.ultima.de);
  }
  if (g) ids.add(g.de);
  ids.delete(a.u.id);
  return ok({ conversas, grupo: grupoResumo, autores: await pessoasPorIds([...ids]) });
}
