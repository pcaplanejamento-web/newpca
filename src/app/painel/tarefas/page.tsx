import { redirect } from "next/navigation";
import { TarefasView } from "@/components/TarefasView";
import { acessoPagina } from "@/lib/acesso-pagina";
import { dataIsoBrasilia } from "@/lib/format";
import { carregarQuadros } from "@/lib/tarefas-dados";

export const dynamic = "force-dynamic";

// Módulo TAREFAS (aba `tarefas`) — os QUADROS do grupo ativo do cabeçalho (cards; abrir um leva ao espaço do quadro
// `/painel/tarefas/[id]`; criar = Configurar Tarefas no grupo ativo). O Calendário de todos os quadros é `/painel/calendario`
// (item do menu); o antigo `?aba=calendario` leva até lá.
export default async function TarefasPage({ searchParams }: { searchParams: Promise<{ aba?: string; mes?: string }> }) {
  const sp = await searchParams;
  if (sp.aba === "calendario") redirect(sp.mes ? `/painel/calendario?mes=${encodeURIComponent(sp.mes)}` : "/painel/calendario");
  const r = await acessoPagina("tarefas");
  if (r.bloqueio) return r.bloqueio;
  const { quadros, podeCriar, modelos, favoritos, conjuntos, ator } = await carregarQuadros(r.acesso);
  return (
    <TarefasView
      quadros={quadros}
      modelos={modelos}
      favoritos={favoritos}
      conjuntos={conjuntos}
      ator={ator}
      hoje={dataIsoBrasilia(new Date().toISOString())}
      podeCriar={podeCriar}
    />
  );
}
