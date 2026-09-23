import { redirect } from "next/navigation";
import { PerfilView } from "@/components/PerfilView";
import { getUsuarioAtual } from "@/lib/auth";
import { getGrupoAtivoId } from "@/lib/grupos";
import { nomeExibicao } from "@/lib/pessoa";
import { listarPessoasDoGrupo, pessoasPorIds, responsavelPadraoGravado } from "@/lib/usuarios";

export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const u = await getUsuarioAtual();
  if (!u) redirect("/login");
  // Protocolação (só quem protocola — editores): o responsável padrão escolhido automaticamente, entre as
  // PESSOAS DO GRUPO ativo (o gravado que saiu do grupo aparece à parte, só para trocar/remover).
  const editor = u.role === "admin" || u.role === "gestor";
  if (!editor) return <PerfilView usuario={u} />;
  const [pessoas, responsavelPadraoId] = await Promise.all([listarPessoasDoGrupo(await getGrupoAtivoId(u)), responsavelPadraoGravado(u.id)]);
  const fora = responsavelPadraoId != null && !pessoas.some((p) => p.id === responsavelPadraoId) ? (await pessoasPorIds([responsavelPadraoId]))[0] : null;
  return <PerfilView usuario={u} protocolacao={{ pessoas, responsavelPadraoId, foraDoGrupo: fora ? nomeExibicao(fora) : null }} />;
}
