import { exigirUsuario } from "@/lib/api-auth";
import { ok } from "@/lib/http";
import { destinosDeTarefa } from "@/lib/tarefas";

export const dynamic = "force-dynamic";

/** Os QUADROS (ativos, que o usuário vê) com as listas — o destino de copiar/mover uma tarefa (carregado ao abrir). */
export async function GET() {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  return ok({ quadros: await destinosDeTarefa(a.u) });
}
