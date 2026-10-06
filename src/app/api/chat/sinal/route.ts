import { exigirUsuario } from "@/lib/api-auth";
import { type Conversa, chaveConversa, ehConversaEmGrupo, idDaConversa } from "@/lib/chat-core";
import { entregarNaCaixa, repassarNoGrupo } from "@/lib/chat-servidor";
import { comandoMarcarLidaChat, consultaParticipa } from "@/lib/chat-sql";
import { getDb } from "@/lib/db";
import { erro, ok, parseCorpo } from "@/lib/http";
import { ehMembroDoGrupo, getConfigChat, quemCompartilhaGrupo } from "@/lib/presenca";
import { chatSinalSchema } from "@/lib/presenca-validation";

export const dynamic = "force-dynamic";

/**
 * O SINAL do chat: "lida" (até a mensagem X — GUARDADA: o ✓✓ e as não lidas valem depois de recarregar) e "digitando…" (só
 * ao vivo). Na privada/em grupo, pelas CAIXAS PESSOAIS (valem em qualquer grupo ativo); no chat do GRUPO, a "lida" vai pelo
 * objeto do grupo (o "digitando" do grupo segue pelo socket). A tela manda no máximo 1 "digitando" a cada 3 s e a "lida" só
 * quando há mensagem nova lida.
 */
export async function POST(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(chatSinalSchema, req);
  if ("resp" in p) return p.resp;
  const { conversa, t, ate } = p.data;
  const doGrupo = conversa === "grupo";
  const cfg = await getConfigChat();
  if (doGrupo ? !cfg?.grupo : !cfg?.privado) return erro("O chat está desligado pelo administrador.", 409);
  if (t === "lida" && !ate) return erro("Falta a mensagem lida.", 422);
  const db = getDb();

  if (doGrupo) {
    const grupo = p.data.grupo;
    if (t !== "lida" || !grupo || !(await ehMembroDoGrupo(a.u.id, grupo))) return erro("Sinal inválido.", 422);
    await comandoMarcarLidaChat(db, `g${grupo}`, a.u.id, ate as string, Date.now());
    await repassarNoGrupo(grupo, { t: "lida", de: a.u.id, conversa: "grupo", ate });
    return ok({});
  }

  const para = [...new Set(p.data.para)].filter((x) => x !== a.u.id);
  const privada = idDaConversa(conversa);
  if (!para.length || (privada != null && (para.length !== 1 || para[0] !== privada)) || (privada == null && !ehConversaEmGrupo(conversa)))
    return erro("Conversa inválida.", 422);
  const chave = chaveConversa(conversa as Conversa, a.u.id, null) as string;
  // Na conversa em grupo, só quem participa sinaliza (a "lida" guarda; o "digitando" vai aos membros).
  if (privada == null && !(await consultaParticipa(db, chave, a.u.id)).length) return erro("Você não está nesta conversa.", 403);
  if (t === "lida") await comandoMarcarLidaChat(db, chave, a.u.id, ate as string, Date.now());
  const podem = await quemCompartilhaGrupo(a.u.id, para);
  const corpo = () => JSON.stringify({ t: "chat-sinal", tipo: t, conversa: privada != null ? `p${a.u.id}` : conversa, de: a.u.id, ...(ate ? { ate } : {}) });
  await Promise.all(para.filter((x) => podem.has(x)).map((x) => entregarNaCaixa(x, corpo())));
  // A "lida" também às MINHAS outras abas/aparelhos (a conversa como eu a vejo): lá as não lidas zeram.
  if (t === "lida") await entregarNaCaixa(a.u.id, JSON.stringify({ t: "chat-sinal", tipo: "lida", conversa, de: a.u.id, ate }));
  return ok({});
}
