import { exigirUsuario } from "@/lib/api-auth";
import { type Conversa, chaveConversa, ehConversaEmGrupo, idDaConversa, limparNomeConversa, limparTextoChat } from "@/lib/chat-core";
import { chatDisponivel, entregarNaCaixa, repassarNoGrupo } from "@/lib/chat-servidor";
import { comandosGuardarMensagem } from "@/lib/chat-sql";
import { getDb } from "@/lib/db";
import { erro, ok, parseCorpo } from "@/lib/http";
import { ehMembroDoGrupo, getConfigChat, quemCompartilhaGrupo } from "@/lib/presenca";
import { chatEnviarSchema } from "@/lib/presenca-validation";
import { contarTentativa, respostaLimite } from "@/lib/seguranca-acesso";

export const dynamic = "force-dynamic";

/**
 * Uma mensagem do CHAT AO VIVO — do GRUPO (os membros), PRIVADA (`p<id>`) ou de uma CONVERSA EM GRUPO escolhida (`c<id>`,
 * 2 a 20 pessoas). A mensagem é GUARDADA por 7 dias (`chat_mensagens`; a limpeza do cron apaga depois) e vai na hora às abas
 * abertas: o grupo pelo objeto do grupo; a privada/em grupo pelas caixas pessoais de cada um (e às outras abas de quem
 * mandou). Só entre pessoas ATIVAS que compartilham um grupo; o ADM liga o chat do grupo e o privado. Sem auditoria (é
 * conversa, não alteração de dado).
 */
export async function POST(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(chatEnviarSchema, req);
  if ("resp" in p) return p.resp;
  const cfg = await getConfigChat();
  const { conversa, id, resp } = p.data;
  const doGrupo = conversa === "grupo";
  if (doGrupo ? !cfg?.grupo : !cfg?.privado) return erro(`O chat ${doGrupo ? "do grupo" : "privado"} está desligado pelo administrador.`, 409);
  const texto = limparTextoChat(p.data.texto);
  if (!texto) return erro("Mensagem vazia.", 422);
  if (!chatDisponivel()) return erro("Chat indisponível neste ambiente.", 503);
  const espera = await contarTentativa("chatPrivado", String(a.u.id));
  if (espera > 0) return respostaLimite(espera);
  const em = Date.now();
  const respTexto = resp ? JSON.stringify(resp) : null;
  const autor = { id: a.u.id, nome: a.u.nome, apelido: a.u.apelido ?? null, foto: a.u.foto ?? null };

  if (doGrupo) {
    const grupo = p.data.grupo;
    if (!grupo || !(await ehMembroDoGrupo(a.u.id, grupo))) return erro("Você não é membro deste grupo.", 403);
    const chave = chaveConversa("grupo", a.u.id, grupo) as string;
    const db = getDb();
    await db.batch(comandosGuardarMensagem(db, { id, chave, de: a.u.id, texto, resp: respTexto, em, participantes: [a.u.id] }) as never);
    const n = await repassarNoGrupo(grupo, { t: "msg", conversa: "grupo", id, de: a.u.id, em, texto, resp: resp ?? null });
    return ok({ entregues: Math.max(0, n - 1), naoEntregues: [], em });
  }

  const privada = idDaConversa(conversa);
  const para = [...new Set(p.data.para)].filter((x) => x !== a.u.id);
  if (!para.length || (privada != null && (para.length !== 1 || para[0] !== privada)) || (privada == null && !ehConversaEmGrupo(conversa)))
    return erro("Conversa inválida.", 422);
  const podem = await quemCompartilhaGrupo(a.u.id, para);
  if (para.some((x) => !podem.has(x))) return erro("Você só conversa com pessoas ativas dos seus grupos.", 403);
  const chave = chaveConversa(conversa as Conversa, a.u.id, null);
  if (!chave) return erro("Conversa inválida.", 422);
  const membros = privada == null ? [a.u.id, ...para] : null;
  const nome = privada == null ? limparNomeConversa(p.data.nome) || null : null;
  const db = getDb();
  await db.batch(comandosGuardarMensagem(db, { id, chave, de: a.u.id, texto, resp: respTexto, em, participantes: [a.u.id, ...para], nome, membros }) as never);
  const extra = membros ? { membros, nome: nome ?? "" } : {};
  const corpo = (conv: string) => JSON.stringify({ t: "chat", conversa: conv, id, de: a.u.id, em, texto, resp: resp ?? null, autor, ...extra });
  // Na privada, cada um vê a conversa pelo outro (`p<eu>` para quem recebe); na em grupo, o mesmo id para todos.
  const [, ...recebidas] = await Promise.all([entregarNaCaixa(a.u.id, corpo(conversa)), ...para.map((x) => entregarNaCaixa(x, corpo(privada != null ? `p${a.u.id}` : conversa)))]);
  const naoEntregues = para.filter((_, i) => !recebidas[i]);
  return ok({ entregues: para.length - naoEntregues.length, naoEntregues, em });
}
