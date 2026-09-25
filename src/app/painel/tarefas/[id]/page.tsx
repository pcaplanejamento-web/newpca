import { notFound, redirect } from "next/navigation";
import { type AbaQuadro, QuadroTarefas } from "@/components/QuadroTarefas";
import { getUsuarioAtual } from "@/lib/auth";
import { carregarQuadro } from "@/lib/tarefas-dados";

export const dynamic = "force-dynamic";

const ABAS: AbaQuadro[] = ["quadro", "lista", "configuracao"];

// ESPAÇO DO QUADRO de tarefas: Quadro (kanban) · Lista (tabela) · Configuração. As abas usam os MESMOS dados (listas,
// cartões, etiquetas, pessoas do grupo) — uma carga só; o filtro e as alterações seguem de uma aba para a outra.
export default async function QuadroTarefasPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const u = await getUsuarioAtual();
  if (!u) redirect("/login");
  const id = Number((await params).id);
  const dados = Number.isInteger(id) && id > 0 ? await carregarQuadro(u, id) : null;
  if (!dados) notFound();
  const sp = await searchParams;
  const aba: AbaQuadro = ABAS.includes(sp.aba as AbaQuadro) ? (sp.aba as AbaQuadro) : "quadro";
  return <QuadroTarefas {...dados} aba={aba} usuarioId={u.id} />;
}
