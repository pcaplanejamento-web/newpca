import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { usuarios } from "@/db/schema";
import { PerfilView } from "@/components/PerfilView";
import { getUsuarioAtual, type UsuarioSessao } from "@/lib/auth";
import { CHAVE_PREF_EMAIL, lerPrefsEmail } from "@/lib/email-core";
import { abasPermitidas, getGrupoAtivo } from "@/lib/grupos";
import { getIntegracoes } from "@/lib/integracoes";
import { googleConfigurado, resendConfigurado } from "@/lib/integracoes-core";
import { getDb } from "@/lib/db";
import { MENSAGEM_VINCULO, SENHA_INUTILIZAVEL } from "@/lib/google-oauth-core";
import { listarPreferenciasTabela } from "@/lib/preferencias-tabela";
import { listarPessoasDoGrupo, mesaResponsavelGravado, pessoasPorIds, responsavelPadraoGravado } from "@/lib/usuarios";

export const dynamic = "force-dynamic";

/** Protocolação (só quem protocola — editores): o responsável padrão escolhido automaticamente, entre as PESSOAS DO
 * GRUPO ativo (o gravado que saiu do grupo aparece à parte — com a foto —, só para trocar/remover). */
async function protocolacaoDe(u: UsuarioSessao, grupoId: number | null) {
  const [pessoas, responsavelPadraoId] = await Promise.all([listarPessoasDoGrupo(grupoId), responsavelPadraoGravado(u.id)]);
  const fora = responsavelPadraoId != null && !pessoas.some((p) => p.id === responsavelPadraoId) ? (await pessoasPorIds([responsavelPadraoId]))[0] : null;
  return { pessoas, responsavelPadraoId, foraDoGrupo: fora ?? null };
}

/** Os avisos que chegam por e-mail — só com o Resend ativo (sem ele, o card nem aparece). */
async function avisosEmailDe(usuarioId: number) {
  try {
    if (!resendConfigurado(await getIntegracoes())) return null;
    return lerPrefsEmail((await listarPreferenciasTabela(usuarioId, CHAVE_PREF_EMAIL))[CHAVE_PREF_EMAIL]);
  } catch {
    return null;
  }
}

/** A conta Google vinculada — só com o login com Google ativo (sem ele, o card nem aparece). */
async function contaGoogleDe(usuarioId: number) {
  try {
    if (!googleConfigurado(await getIntegracoes())) return null;
    const [r] = await getDb().select({ email: usuarios.googleEmail, senha: usuarios.senhaHash }).from(usuarios).where(eq(usuarios.id, usuarioId)).limit(1);
    return { email: r?.email ?? null, soGoogle: r?.senha === SENHA_INUTILIZAVEL };
  } catch {
    return null;
  }
}

export default async function PerfilPage({ searchParams }: { searchParams: Promise<{ google?: string | string[] }> }) {
  const u = await getUsuarioAtual();
  if (!u) redirect("/login");
  const grupo = await getGrupoAtivo(u);
  const editor = u.role === "admin" || u.role === "gestor";
  const codigo = (await searchParams).google;
  const retornoGoogle = MENSAGEM_VINCULO[Array.isArray(codigo) ? (codigo[0] ?? "") : (codigo ?? "")] ?? null;
  const [abas, protocolacao, mesaResponsavel, avisosEmail, contaGoogle] = await Promise.all([
    abasPermitidas(u, grupo),
    editor ? protocolacaoDe(u, grupo?.id ?? null) : null,
    mesaResponsavelGravado(u.id),
    avisosEmailDe(u.id),
    contaGoogleDe(u.id),
  ]);
  // Sem nenhum módulo liberado no grupo ativo, o `/painel` traz para cá — o Perfil diz o que fazer. A preferência da Mesa
  // (com que responsável ela abre) só para quem vê a Mesa.
  return (
    <PerfilView
      usuario={u}
      protocolacao={protocolacao}
      mesaResponsavel={abas.has("dfd") ? mesaResponsavel : null}
      semModulos={abas.size === 0}
      avisosEmail={avisosEmail}
      contaGoogle={contaGoogle}
      retornoGoogle={retornoGoogle}
    />
  );
}
