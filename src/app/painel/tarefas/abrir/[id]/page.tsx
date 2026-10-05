import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AcessoRestrito } from "@/components/AcessoRestrito";
import { tarefas } from "@/db/schema";
import { getUsuarioAtual } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

// O link CANÔNICO de uma tarefa (avisos do sino, e-mails, "Copiar link"): acha o quadro ATUAL da tarefa e leva até ela —
// a tarefa movida de quadro continua abrindo. O acesso é conferido pela página do quadro.
export default async function AbrirTarefaPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getUsuarioAtual())) redirect("/login");
  const id = Number((await params).id);
  const [t] = Number.isInteger(id) && id > 0 ? await getDb().select({ quadroId: tarefas.quadroId }).from(tarefas).where(eq(tarefas.id, id)).limit(1) : [];
  if (!t) return <AcessoRestrito mensagem="Esta tarefa não existe mais — foi excluída." voltar={{ href: "/painel/tarefas", rotulo: "Ir para Tarefas" }} />;
  redirect(`/painel/tarefas/${t.quadroId}?tarefa=${id}`);
}
