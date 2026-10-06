import { getCloudflareContext } from "@opennextjs/cloudflare";
import { exigirUsuario } from "@/lib/api-auth";
import { idDaConversa } from "@/lib/chat-core";
import { erro, ok, parseCorpo } from "@/lib/http";
import { getConfigChat, quemCompartilhaGrupo } from "@/lib/presenca";
import { chatSinalSchema } from "@/lib/presenca-validation";

export const dynamic = "force-dynamic";

/**
 * O SINAL do chat ao vivo na conversa PRIVADA ou EM GRUPO: "lida" (até a mensagem X — o ✓✓) e "digitando…". Vai pelas
 * CAIXAS PESSOAIS (como a mensagem), que valem em qualquer grupo ativo — pelo canal do grupo só chegava a quem estava no
 * MESMO grupo. Nada é gravado; só a quem compartilha um grupo com quem manda. A tela manda no máximo 1 "digitando" a cada
 * 3 s e a "lida" só quando há mensagem nova lida.
 */
export async function POST(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(chatSinalSchema, req);
  if ("resp" in p) return p.resp;
  if (!(await getConfigChat())?.privado) return erro("O chat privado está desligado pelo administrador.", 409);
  const { conversa, t, ate } = p.data;
  if (t === "lida" && !ate) return erro("Falta a mensagem lida.", 422);
  const para = [...new Set(p.data.para)].filter((x) => x !== a.u.id);
  const privada = idDaConversa(conversa);
  if (!para.length || (privada != null && (para.length !== 1 || para[0] !== privada))) return erro("Conversa inválida.", 422);
  const podem = await quemCompartilhaGrupo(a.u.id, para);
  let ns: CloudflareEnv["CAIXA_NOTIFICACOES"] | undefined;
  try {
    ns = getCloudflareContext().env.CAIXA_NOTIFICACOES;
  } catch {
    ns = undefined;
  }
  if (!ns) return erro("Chat indisponível neste ambiente.", 503);
  const caixas = ns;
  await Promise.all(
    para
      .filter((x) => podem.has(x))
      .map(async (x) => {
        const corpo = JSON.stringify({ t: "chat-sinal", tipo: t, conversa: privada != null ? `p${a.u.id}` : conversa, de: a.u.id, ...(ate ? { ate } : {}) });
        try {
          await caixas.get(caixas.idFromName(`u${x}`)).fetch("https://caixa/chat", { method: "POST", body: corpo });
        } catch {
          /* sinal perdido: não é grave */
        }
      }),
  );
  return ok({});
}
