import { redirect } from "next/navigation";
import { TarefasView } from "@/components/TarefasView";
import { getUsuarioAtual } from "@/lib/auth";
import { carregarQuadros } from "@/lib/tarefas-dados";

export const dynamic = "force-dynamic";

// Módulo TAREFAS (aba `tarefas`) — os QUADROS do grupo ativo do cabeçalho (cards). Abrir um card leva ao espaço do quadro
// (`/painel/tarefas/[id]`: Dashboard · Quadro · Lista · Calendário · Configuração). Criar quadro = editor, no grupo ativo.
export default async function TarefasPage() {
  const u = await getUsuarioAtual();
  if (!u) redirect("/login");
  const { quadros, grupoAtivo, modelos } = await carregarQuadros(u);
  return <TarefasView quadros={quadros} modelos={modelos} podeCriar={(u.role === "admin" || u.role === "gestor") && grupoAtivo != null} />;
}
