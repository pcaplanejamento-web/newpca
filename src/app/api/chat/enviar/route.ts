import { getCloudflareContext } from "@opennextjs/cloudflare";
import { exigirUsuario } from "@/lib/api-auth";
import { idDaConversa, limparNomeConversa, limparTextoChat } from "@/lib/chat-core";
import { erro, ok, parseCorpo } from "@/lib/http";
import { getConfigChat, quemCompartilhaGrupo } from "@/lib/presenca";
import { chatEnviarSchema } from "@/lib/presenca-validation";
import { contarTentativa, respostaLimite } from "@/lib/seguranca-acesso";

export const dynamic = "force-dynamic";

/**
 * Uma mensagem do CHAT AO VIVO fora do grupo ativo: a PRIVADA (`p<id>`) ou a de uma CONVERSA EM GRUPO escolhida (`c<id>`,
 * 2 a 20 pessoas). Só entre pessoas ATIVAS que compartilham um grupo com quem manda, com o chat privado ligado pelo ADM.
 * NADA É GRAVADO (nem banco, nem auditoria): vai às abas abertas de cada destinatário (a caixa pessoal) e às outras abas
 * de quem mandou; quem não tem nenhuma aba aberta volta em `naoEntregues`.
 */
export async function POST(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(chatEnviarSchema, req);
  if ("resp" in p) return p.resp;
  if (!(await getConfigChat()).privado) return erro("O chat privado está desligado pelo administrador.", 409);
  const { conversa, id, resp } = p.data;
  const texto = limparTextoChat(p.data.texto);
  if (!texto) return erro("Mensagem vazia.", 422);
  const para = [...new Set(p.data.para)].filter((x) => x !== a.u.id);
  const privada = idDaConversa(conversa);
  if (!para.length) return erro("Escolha outra pessoa.", 422);
  if (privada != null && (para.length !== 1 || para[0] !== privada)) return erro("Conversa inválida.", 422);
  const espera = await contarTentativa("chatPrivado", String(a.u.id));
  if (espera > 0) return respostaLimite(espera);
  const podem = await quemCompartilhaGrupo(a.u.id, para);
  if (para.some((x) => !podem.has(x))) return erro("Você só conversa com pessoas ativas dos seus grupos.", 403);
  let ns: CloudflareEnv["CAIXA_NOTIFICACOES"] | undefined;
  try {
    ns = getCloudflareContext().env.CAIXA_NOTIFICACOES;
  } catch {
    ns = undefined;
  }
  if (!ns) return erro("Chat indisponível neste ambiente.", 503);
  const em = Date.now();
  const autor = { id: a.u.id, nome: a.u.nome, apelido: a.u.apelido ?? null, foto: a.u.foto ?? null };
  const grupo = privada == null ? { membros: [a.u.id, ...para], nome: limparNomeConversa(p.data.nome) } : {};
  const corpo = (conv: string) => JSON.stringify({ t: "chat", conversa: conv, id, de: a.u.id, em, texto, resp: resp ?? null, autor, ...grupo });
  const caixas = ns;
  const entregar = async (dono: number, conv: string) => {
    try {
      const r = await caixas.get(caixas.idFromName(`u${dono}`)).fetch("https://caixa/chat", { method: "POST", body: corpo(conv) });
      return ((await r.json()) as { n?: number }).n ?? 0;
    } catch {
      return 0;
    }
  };
  // Na privada, cada um vê a conversa pelo outro (`p<eu>` para quem recebe); na em grupo, o mesmo id para todos.
  const [, ...ns2] = await Promise.all([entregar(a.u.id, conversa), ...para.map((x) => entregar(x, privada != null ? `p${a.u.id}` : conversa))]);
  const naoEntregues = para.filter((_, i) => !ns2[i]);
  return ok({ entregues: para.length - naoEntregues.length, naoEntregues, em });
}
