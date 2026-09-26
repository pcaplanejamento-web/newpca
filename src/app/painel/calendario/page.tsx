import { redirect } from "next/navigation";
import { CalendarioQuadros } from "@/components/CalendarioQuadros";
import { getUsuarioAtual } from "@/lib/auth";
import { carregarCalendario } from "@/lib/tarefas-dados";

export const dynamic = "force-dynamic";

// Módulo CALENDÁRIO (aba `calendario`, permissão própria): os eventos de TODOS os quadros de tarefas do grupo ativo — o
// período de cada tarefa, as ocorrências da recorrência, os eventos cadastrados, os feriados e (quem vê o PCA) a previsão
// do PCA. `?mes=AAAA-MM` escolhe o mês (o servidor carrega a grade dele); `?evento=<chave>` abre o evento (o link do lembrete).
export default async function CalendarioPage({ searchParams }: { searchParams: Promise<{ mes?: string; evento?: string; ano?: string }> }) {
  const u = await getUsuarioAtual();
  if (!u) redirect("/login");
  const sp = await searchParams;
  const calendario = await carregarCalendario(u, sp.mes, sp.ano === "1");
  return (
    <>
      <h1 className="sr-only">Calendário</h1>
      <CalendarioQuadros dados={calendario} usuarioId={u.id} eventoInicial={sp.evento?.slice(0, 40)} />
    </>
  );
}
