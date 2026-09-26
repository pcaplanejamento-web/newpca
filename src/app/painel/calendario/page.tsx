import { redirect } from "next/navigation";
import { CalendarioQuadros } from "@/components/CalendarioQuadros";
import { getUsuarioAtual } from "@/lib/auth";
import { carregarCalendario } from "@/lib/tarefas-dados";

export const dynamic = "force-dynamic";

// Módulo CALENDÁRIO (aba `calendario`, permissão própria): os eventos de TODOS os quadros de tarefas do grupo ativo — o
// período de cada tarefa, as ocorrências da recorrência, os eventos cadastrados, os feriados e (quem vê o PCA) a previsão
// do PCA. `?mes=AAAA-MM` escolhe o mês (o servidor carrega a grade dele); `?evento=<chave>` abre o evento (o link do lembrete).
export default async function CalendarioPage({ searchParams }: { searchParams: Promise<{ mes?: string; evento?: string }> }) {
  const u = await getUsuarioAtual();
  if (!u) redirect("/login");
  const sp = await searchParams;
  const calendario = await carregarCalendario(u, sp.mes);
  return (
    <div className="space-y-[var(--gap-block)]">
      <div>
        <h1 className="text-xl font-bold text-text">Calendário</h1>
        <p className="text-sm text-muted">Os eventos das tarefas de todos os quadros do grupo ativo do cabeçalho.</p>
      </div>
      <CalendarioQuadros dados={calendario} usuarioId={u.id} eventoInicial={sp.evento?.slice(0, 40)} />
    </div>
  );
}
