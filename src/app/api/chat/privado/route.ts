import { getCloudflareContext } from "@opennextjs/cloudflare";
import { exigirUsuario } from "@/lib/api-auth";
import { limparTextoChat } from "@/lib/chat-core";
import { erro, ok, parseCorpo } from "@/lib/http";
import { compartilhamGrupo, getConfigChat } from "@/lib/presenca";
import { chatPrivadoSchema } from "@/lib/presenca-validation";
import { contarTentativa, respostaLimite } from "@/lib/seguranca-acesso";

export const dynamic = "force-dynamic";

/**
 * Uma mensagem do CHAT PRIVADO ao vivo: só entre pessoas que compartilham um grupo, com o chat privado ligado pelo ADM.
 * NADA É GRAVADO (nem banco, nem auditoria): a mensagem vai às abas abertas do destinatário (a caixa pessoal dele) e às
 * outras abas de quem mandou; sem nenhuma aba aberta do destinatário = "não entregue".
 */
export async function POST(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(chatPrivadoSchema, req);
  if ("resp" in p) return p.resp;
  if (!(await getConfigChat()).privado) return erro("O chat privado está desligado pelo administrador.", 409);
  const { para, id, resp } = p.data;
  const texto = limparTextoChat(p.data.texto);
  if (!texto) return erro("Mensagem vazia.", 422);
  if (para === a.u.id) return erro("Escolha outra pessoa.", 422);
  const espera = await contarTentativa("chatPrivado", String(a.u.id));
  if (espera > 0) return respostaLimite(espera);
  if (!(await compartilhamGrupo(a.u.id, para))) return erro("Você só conversa com pessoas dos seus grupos.", 403);
  let ns: CloudflareEnv["CAIXA_NOTIFICACOES"] | undefined;
  try {
    ns = getCloudflareContext().env.CAIXA_NOTIFICACOES;
  } catch {
    ns = undefined;
  }
  if (!ns) return erro("Chat indisponível neste ambiente.", 503);
  const em = Date.now();
  const autor = { id: a.u.id, nome: a.u.nome, apelido: a.u.apelido ?? null, foto: a.u.foto ?? null };
  const corpo = (conversa: string) => JSON.stringify({ t: "chat", conversa, id, de: a.u.id, em, texto, resp: resp ?? null, autor });
  const caixas = ns;
  const entregar = async (dono: number, conversa: string) => {
    try {
      const r = await caixas.get(caixas.idFromName(`u${dono}`)).fetch("https://caixa/chat", { method: "POST", body: corpo(conversa) });
      return ((await r.json()) as { n?: number }).n ?? 0;
    } catch {
      return 0;
    }
  };
  const [n] = await Promise.all([entregar(para, `p${a.u.id}`), entregar(a.u.id, `p${para}`)]);
  return ok({ entregue: n > 0, em });
}
