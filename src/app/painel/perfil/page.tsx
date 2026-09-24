import { redirect } from "next/navigation";
import { PerfilView } from "@/components/PerfilView";
import { getUsuarioAtual, type UsuarioSessao } from "@/lib/auth";
import { abasPermitidas, getGrupoAtivo } from "@/lib/grupos";
import { nomeExibicao } from "@/lib/pessoa";
import { listarPessoasDoGrupo, pessoasPorIds, responsavelPadraoGravado } from "@/lib/usuarios";

export const dynamic = "force-dynamic";

/** Protocolação (só quem protocola — editores): o responsável padrão escolhido automaticamente, entre as PESSOAS DO
 * GRUPO ativo (o gravado que saiu do grupo aparece à parte, só para trocar/remover). */
async function protocolacaoDe(u: UsuarioSessao, grupoId: number | null) {
  const [pessoas, responsavelPadraoId] = await Promise.all([listarPessoasDoGrupo(grupoId), responsavelPadraoGravado(u.id)]);
  const fora = responsavelPadraoId != null && !pessoas.some((p) => p.id === responsavelPadraoId) ? (await pessoasPorIds([responsavelPadraoId]))[0] : null;
  return { pessoas, responsavelPadraoId, foraDoGrupo: fora ? nomeExibicao(fora) : null };
}

export default async function PerfilPage() {
  const u = await getUsuarioAtual();
  if (!u) redirect("/login");
  const grupo = await getGrupoAtivo(u);
  const editor = u.role === "admin" || u.role === "gestor";
  const [abas, protocolacao] = await Promise.all([abasPermitidas(u, grupo), editor ? protocolacaoDe(u, grupo?.id ?? null) : null]);
  // Sem nenhum módulo liberado no grupo ativo, o `/painel` traz para cá — o Perfil diz o que fazer.
  return <PerfilView usuario={u} protocolacao={protocolacao} semModulos={abas.size === 0} />;
}
