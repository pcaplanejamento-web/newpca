import { notFound, redirect } from "next/navigation";
import { type AbaQuadro, QuadroTarefas } from "@/components/QuadroTarefas";
import { getUsuarioAtual } from "@/lib/auth";
import { rotulosVinculos } from "@/lib/tarefas";
import { lerVinculo } from "@/lib/tarefas-core";
import { carregarQuadro } from "@/lib/tarefas-dados";

export const dynamic = "force-dynamic";

const ABAS: AbaQuadro[] = ["dashboard", "quadro", "lista", "calendario", "configuracao"];

// ESPAÇO DO QUADRO de tarefas: Dashboard · Quadro (kanban) · Lista (tabela) · Calendário · Configuração. As abas usam os MESMOS dados
// (listas, cartões, etiquetas, pessoas do grupo) — uma carga só; o filtro e as alterações seguem de uma aba para a outra.
// `?nova=protocolo:12` ("Criar tarefa" da Mesa) abre uma tarefa NOVA já vinculada; `?tarefa=<id>` abre aquela tarefa.
export default async function QuadroTarefasPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string; nova?: string; tarefa?: string }>;
}) {
  const u = await getUsuarioAtual();
  if (!u) redirect("/login");
  const id = Number((await params).id);
  const dados = Number.isInteger(id) && id > 0 ? await carregarQuadro(u, id) : null;
  if (!dados) notFound();
  const sp = await searchParams;
  const aba: AbaQuadro = ABAS.includes(sp.aba as AbaQuadro) ? (sp.aba as AbaQuadro) : "quadro";
  const nova = lerVinculo(sp.nova);
  const novaInicial = nova ? { ...nova, rotulo: (await rotulosVinculos([nova])).get(`${nova.tipo}:${nova.id}`) ?? null } : null;
  const tarefaInicial = dados.tarefas.find((t) => String(t.id) === sp.tarefa)?.id ?? null;
  return <QuadroTarefas {...dados} aba={aba} usuarioId={u.id} novaInicial={novaInicial} tarefaInicial={tarefaInicial} />;
}
