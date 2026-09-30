import { gruposDeTarefas, podeTela } from "@/lib/acesso";
import { exigirSessao } from "@/lib/api-auth";
import { erro, ok } from "@/lib/http";
import { buscarVinculos } from "@/lib/tarefas";
import { ehTipoVinculo } from "@/lib/tarefas-core";

export const dynamic = "force-dynamic";

/** Opções para VINCULAR uma tarefa (`?tipo=protocolo|dfd|pca|orcamento|tarefa&q=`) — até 50, no escopo do usuário e só
 * das telas que o papel VÊ (protocolo/DFD = uma das Mesas; PCA; Orçamento; tarefa = os grupos com Tarefas). */
export async function GET(req: Request) {
  const a = await exigirSessao();
  if ("erro" in a) return a.erro;
  const sp = new URL(req.url).searchParams;
  const tipo = sp.get("tipo");
  if (!ehTipoVinculo(tipo)) return erro("Tipo inválido.", 422);
  const ve = (t: "dfd" | "pca" | "orcamento") => podeTela(a.acesso, t).visualizar;
  const visivel = tipo === "tarefa" || (tipo === "pca" ? ve("pca") : tipo === "orcamento" ? ve("orcamento") : ve("dfd") || ve("pca"));
  if (!visivel) return ok({ opcoes: [] });
  return ok({ opcoes: await buscarVinculos(a.u, tipo, (sp.get("q") ?? "").slice(0, 80), gruposDeTarefas(a.acesso, "visualizar", true)) });
}
