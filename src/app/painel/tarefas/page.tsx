import { redirect } from "next/navigation";
import { type AbaTarefas, TarefasView } from "@/components/TarefasView";
import { getUsuarioAtual } from "@/lib/auth";
import { carregarCalendario, carregarQuadros } from "@/lib/tarefas-dados";

export const dynamic = "force-dynamic";

// Módulo TAREFAS (aba `tarefas`): **Quadros** — os quadros do grupo ativo do cabeçalho (cards; abrir um leva ao espaço do
// quadro `/painel/tarefas/[id]`; criar = editor, no grupo ativo) — e **Calendário** (`?aba=calendario&mes=AAAA-MM`) — as
// tarefas de TODOS os quadros do grupo. O servidor carrega só a aba ativa.
export default async function TarefasPage({ searchParams }: { searchParams: Promise<{ aba?: string; mes?: string }> }) {
  const u = await getUsuarioAtual();
  if (!u) redirect("/login");
  const sp = await searchParams;
  const aba: AbaTarefas = sp.aba === "calendario" ? "calendario" : "quadros";
  const { calendario, ...dados } = aba === "calendario" ? await carregarCalendario(u, sp.mes) : { ...(await carregarQuadros(u)), calendario: undefined };
  return (
    <TarefasView
      aba={aba}
      quadros={dados.quadros}
      modelos={dados.modelos}
      calendario={calendario}
      usuarioId={u.id}
      podeCriar={(u.role === "admin" || u.role === "gestor") && dados.grupoAtivo != null}
    />
  );
}
