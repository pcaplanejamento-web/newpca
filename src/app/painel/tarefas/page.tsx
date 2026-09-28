import { redirect } from "next/navigation";
import { TarefasView } from "@/components/TarefasView";
import { getUsuarioAtual } from "@/lib/auth";
import { dataIsoBrasilia } from "@/lib/format";
import { carregarQuadros } from "@/lib/tarefas-dados";

export const dynamic = "force-dynamic";

// Módulo TAREFAS (aba `tarefas`) — os QUADROS do grupo ativo do cabeçalho (cards; abrir um leva ao espaço do quadro
// `/painel/tarefas/[id]`; criar = editor, no grupo ativo). O Calendário de todos os quadros é `/painel/calendario`
// (item do menu); o antigo `?aba=calendario` leva até lá.
export default async function TarefasPage({ searchParams }: { searchParams: Promise<{ aba?: string; mes?: string }> }) {
  const u = await getUsuarioAtual();
  if (!u) redirect("/login");
  const sp = await searchParams;
  if (sp.aba === "calendario") redirect(sp.mes ? `/painel/calendario?mes=${encodeURIComponent(sp.mes)}` : "/painel/calendario");
  const { quadros, grupoAtivo, modelos, favoritos, conjuntos, ator } = await carregarQuadros(u);
  return (
    <TarefasView
      quadros={quadros}
      modelos={modelos}
      favoritos={favoritos}
      conjuntos={conjuntos}
      ator={ator}
      hoje={dataIsoBrasilia(new Date().toISOString())}
      podeCriar={(u.role === "admin" || u.role === "gestor") && grupoAtivo != null}
    />
  );
}
