import { exigirUsuario } from "@/lib/api-auth";
import { listarItensDfds } from "@/lib/dfd";
import { getReparticaoFiltro } from "@/lib/grupos";
import { ok } from "@/lib/http";

// Lista PLANA dos itens dos DFDs em escopo (visão "Itens" da tela DFD) — escopada pela unidade
// ativa (Geral ⇒ todos), carregada SOB DEMANDA pelo cliente ao abrir a visão (não pesa o load inicial).
export async function GET() {
  const g = await exigirUsuario();
  if ("erro" in g) return g.erro;
  const rep = await getReparticaoFiltro(g.u);
  const itens = await listarItensDfds(rep?.id);
  return ok({ itens });
}
