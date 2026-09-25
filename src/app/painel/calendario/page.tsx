import { redirect } from "next/navigation";
import { CalendarioQuadros } from "@/components/CalendarioQuadros";
import { NavTarefas } from "@/components/TarefasView";
import { getUsuarioAtual } from "@/lib/auth";
import { carregarCalendario } from "@/lib/tarefas-dados";

export const dynamic = "force-dynamic";

// CALENDÁRIO (item do menu, mesma permissão do módulo Tarefas): as tarefas de TODOS os quadros do grupo ativo, na cor de
// cada quadro — `?mes=AAAA-MM` escolhe o mês (o servidor carrega a grade dele).
export default async function CalendarioPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const u = await getUsuarioAtual();
  if (!u) redirect("/login");
  const calendario = await carregarCalendario(u, (await searchParams).mes);
  return (
    <div className="space-y-[var(--gap-block)]">
      <div>
        <h1 className="text-xl font-bold text-text">Calendário</h1>
        <p className="text-sm text-muted">As tarefas de todos os quadros do grupo ativo do cabeçalho, pelo prazo.</p>
      </div>
      <NavTarefas atual="calendario" />
      <CalendarioQuadros dados={calendario} usuarioId={u.id} />
    </div>
  );
}
