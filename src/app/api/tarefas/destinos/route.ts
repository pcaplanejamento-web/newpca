import { gruposDeTarefas } from "@/lib/acesso";
import { exigirSessao } from "@/lib/api-auth";
import { ok } from "@/lib/http";
import { destinosDeTarefa } from "@/lib/tarefas";

export const dynamic = "force-dynamic";

/** Os QUADROS (ativos, nos grupos em que o papel MEXE nas tarefas) com as listas — o destino de copiar/mover uma tarefa
 * (carregado ao abrir). */
export async function GET() {
  const a = await exigirSessao();
  if ("erro" in a) return a.erro;
  return ok({ quadros: await destinosDeTarefa(a.u, gruposDeTarefas(a.acesso, "manipular", true)) });
}
