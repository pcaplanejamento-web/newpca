import { exigirUsuario } from "@/lib/api-auth";
import { type Conversa, chaveConversa, conversaValida, ehConversaEmGrupo, lerResposta, MAX_HISTORICO, VALIDADE_CHAT_MS } from "@/lib/chat-core";
import { consultaHistoricoChat, consultaLidasChat, consultaParticipa } from "@/lib/chat-sql";
import { getDb } from "@/lib/db";
import { erro, ok } from "@/lib/http";
import { ehMembroDoGrupo, getConfigChat } from "@/lib/presenca";
import { pessoasPorIds } from "@/lib/usuarios";

export const dynamic = "force-dynamic";

/**
 * O HISTÓRICO de uma conversa (últimos 7 dias, as 200 mais recentes) + até onde cada um LEU (o ✓✓) + os autores (foto e
 * apelido). Só de quem participa: o chat do grupo, os membros; a privada, as duas pessoas; a em grupo, quem está nela.
 */
export async function GET(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const busca = new URL(req.url).searchParams;
  const conversa = busca.get("conversa");
  if (!conversaValida(conversa)) return erro("Conversa inválida.", 422);
  const cfg = await getConfigChat();
  if (conversa === "grupo" ? !cfg?.grupo : !cfg?.privado) return erro("O chat está desligado pelo administrador.", 409);
  const grupo = Number(busca.get("grupo"));
  const chave = chaveConversa(conversa as Conversa, a.u.id, Number.isInteger(grupo) && grupo > 0 ? grupo : null);
  if (!chave) return erro("Conversa inválida.", 422);
  const db = getDb();
  if (conversa === "grupo" ? !(await ehMembroDoGrupo(a.u.id, grupo)) : ehConversaEmGrupo(conversa) && !(await consultaParticipa(db, chave, a.u.id)).length)
    return erro("Você não está nesta conversa.", 403);
  const [linhas, lidas] = await Promise.all([consultaHistoricoChat(db, chave, Date.now() - VALIDADE_CHAT_MS, MAX_HISTORICO), consultaLidasChat(db, chave)]);
  const mensagens = linhas.reverse().map((m) => {
    let resp = null;
    try {
      resp = m.resp ? lerResposta(JSON.parse(m.resp)) : null;
    } catch {
      resp = null;
    }
    return { id: m.id, conversa, de: m.de, em: m.em, texto: m.texto, resp };
  });
  const autores = await pessoasPorIds([...new Set(mensagens.map((m) => m.de))].filter((x) => x !== a.u.id));
  return ok({ mensagens, lidas: lidas.filter((l) => l.usuarioId !== a.u.id).map((l) => [l.usuarioId, l.lidaAte]), autores, completo: linhas.length < MAX_HISTORICO });
}
