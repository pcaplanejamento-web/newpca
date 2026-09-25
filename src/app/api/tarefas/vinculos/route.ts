import { exigirUsuario } from "@/lib/api-auth";
import { erro, ok } from "@/lib/http";
import { buscarVinculos } from "@/lib/tarefas";
import { ehTipoVinculo } from "@/lib/tarefas-core";

export const dynamic = "force-dynamic";

/** Opções para VINCULAR uma tarefa (`?tipo=protocolo|dfd|pca|orcamento&q=`) — até 50, no escopo do usuário. */
export async function GET(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const sp = new URL(req.url).searchParams;
  const tipo = sp.get("tipo");
  if (!ehTipoVinculo(tipo)) return erro("Tipo inválido.", 422);
  return ok({ opcoes: await buscarVinculos(a.u, tipo, (sp.get("q") ?? "").slice(0, 80)) });
}
