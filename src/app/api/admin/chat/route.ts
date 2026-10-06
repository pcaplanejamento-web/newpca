import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { getConfigChat, gravarConfigChat } from "@/lib/presenca";
import { configChatSchema } from "@/lib/presenca-validation";

export const dynamic = "force-dynamic";

// Configurações → Chat (ADM): o chat AO VIVO do grupo e o privado (nada é gravado). Mesma linha `configuracoes` id=1
// (chave `chat`) — as chaves irmãs ficam.

export async function GET() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const chat = await getConfigChat({ fresco: true });
  if (!chat) return erro("Não foi possível ler a configuração do chat — tente de novo.", 503);
  return ok({ chat });
}

export async function PATCH(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(configChatSchema, req);
  if ("resp" in p) return p.resp;
  const antes = (await getConfigChat({ fresco: true })) ?? { grupo: false, privado: false };
  const chat = await gravarConfigChat(p.data, g.u.id);
  const diff = [
    ...(antes.grupo !== chat.grupo ? [`chat do grupo ${chat.grupo ? "ligado" : "desligado"}`] : []),
    ...(antes.privado !== chat.privado ? [`chat privado ${chat.privado ? "ligado" : "desligado"}`] : []),
  ];
  await registrarAuditoria({ usuario: g.u, acao: "editar", entidade: "configuracao", entidadeId: 1, resumo: `Chat (ADM): ${diff.join("; ") || "sem mudança"}` });
  return ok({ chat });
}
