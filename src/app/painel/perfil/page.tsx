import { redirect } from "next/navigation";
import { PerfilView } from "@/components/PerfilView";
import { getUsuarioAtual } from "@/lib/auth";
import { listarPessoas, responsavelPadraoDe } from "@/lib/usuarios";

export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const u = await getUsuarioAtual();
  if (!u) redirect("/login");
  // Protocolação (só quem protocola — editores): o responsável padrão escolhido automaticamente.
  const editor = u.role === "admin" || u.role === "gestor";
  const [pessoas, responsavelPadraoId] = editor ? await Promise.all([listarPessoas(), responsavelPadraoDe(u.id)]) : [[], null];
  return <PerfilView usuario={u} protocolacao={editor ? { pessoas, responsavelPadraoId } : null} />;
}
