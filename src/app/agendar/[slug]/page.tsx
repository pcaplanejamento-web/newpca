import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AgendarView } from "@/components/AgendarView";
import { agendaOcupada, paginaPublica, tarefaDaPagina } from "@/lib/agendamento";
import { horariosLivres } from "@/lib/agendamento-core";
import { getIntegracoes } from "@/lib/integracoes";
import { turnstileConfigurado } from "@/lib/integracoes-core";
import { somarDias } from "@/lib/tarefas-core";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const pub = await paginaPublica((await params).slug);
  return { title: pub ? `${pub.pagina.titulo} — ${pub.responsavel}` : "Agendamento", robots: { index: false } };
}

// PÁGINA PÚBLICA DE AGENDAMENTO (sem login): os horários livres de quem atende nos próximos dias — a janela da página
// menos o que está ocupado na agenda dela e os feriados.
export default async function AgendarPage({ params }: { params: Promise<{ slug: string }> }) {
  const pub = await paginaPublica((await params).slug);
  if (!pub || !(await tarefaDaPagina(pub.pagina.tarefaId))) notFound();
  const { pagina, responsavel } = pub;
  const agora = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 16);
  const hoje = agora.slice(0, 10);
  const [{ ocupados, feriados }, integ] = await Promise.all([agendaOcupada(pagina.usuarioId, hoje, somarDias(hoje, pagina.janelaDias)), getIntegracoes()]);
  const livres = [...horariosLivres(pagina, ocupados, agora, feriados)];
  return (
    <main className="flex min-h-dvh items-start justify-center bg-surface-2 p-[var(--pad-canvas)] lg:items-center">
      <AgendarView
        pagina={{ slug: pagina.slug, titulo: pagina.titulo, descricao: pagina.descricao, duracaoMin: pagina.duracaoMin, responsavel }}
        livres={livres}
        turnstile={{ enabled: turnstileConfigurado(integ), siteKey: integ.turnstile.siteKey }}
      />
    </main>
  );
}
