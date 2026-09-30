import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { reparticoes, usuarios } from "@/db/schema";
import { type IdentidadePerfil, PerfilView } from "@/components/PerfilView";
import { getUsuarioAtual, type UsuarioSessao } from "@/lib/auth";
import { CHAVE_PREF_EMAIL, lerPrefsEmail } from "@/lib/email-core";
import { abasPermitidas, getGrupoAtivo } from "@/lib/grupos";
import { getIntegracoes } from "@/lib/integracoes";
import { googleConfigurado, resendConfigurado, turnstileConfigurado } from "@/lib/integracoes-core";
import { getDb } from "@/lib/db";
import { mensagemVinculo, SENHA_INUTILIZAVEL } from "@/lib/google-oauth-core";
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

/** A identificação institucional (só leitura) + o que a conta tem: unidade, e-mail confirmado, senha e a conta Google. */
async function identidadeDe(usuarioId: number): Promise<IdentidadePerfil> {
  const [r] = await getDb()
    .select({ unidade: reparticoes.nome, verificado: usuarios.emailVerificadoEm, senha: usuarios.senhaHash, googleEmail: usuarios.googleEmail })
    .from(usuarios)
    .leftJoin(reparticoes, eq(reparticoes.id, usuarios.reparticaoId))
    .where(eq(usuarios.id, usuarioId))
    .limit(1);
  return { unidade: r?.unidade ?? null, emailVerificado: !!r?.verificado, semSenha: r?.senha === SENHA_INUTILIZAVEL, googleEmail: r?.googleEmail ?? null };
}

export default async function PerfilPage({ searchParams }: { searchParams: Promise<{ google?: string | string[]; motivo?: string | string[] }> }) {
  const u = await getUsuarioAtual();
  if (!u) redirect("/login");
  const grupo = await getGrupoAtivo(u);
  const editor = u.role === "admin" || u.role === "gestor";
  const sp = await searchParams;
  const retornoGoogle = mensagemVinculo(sp.google, sp.motivo);
  const [abas, protocolacao, mesaResponsavel, avisosEmail, identidade, integ] = await Promise.all([
    abasPermitidas(u, grupo),
    editor ? protocolacaoDe(u, grupo?.id ?? null) : null,
    mesaResponsavelGravado(u.id),
    avisosEmailDe(u.id),
    identidadeDe(u.id),
    getIntegracoes(),
  ]);
  // A conta Google só com o login com Google ativo (sem ele, o card nem aparece).
  const contaGoogle = googleConfigurado(integ) ? { email: identidade.googleEmail, soGoogle: identidade.semSenha } : null;
  // Sem nenhum módulo liberado no grupo ativo, o `/painel` traz para cá — o Perfil diz o que fazer. A preferência da Mesa
  // (com que responsável ela abre) só para quem vê a Mesa.
  return (
    <PerfilView
      usuario={u}
      identidade={identidade}
      turnstile={{ enabled: turnstileConfigurado(integ), siteKey: integ.turnstile.siteKey }}
      protocolacao={protocolacao}
      mesaResponsavel={abas.has("dfd") ? mesaResponsavel : null}
      semModulos={abas.size === 0}
      avisosEmail={avisosEmail}
      contaGoogle={contaGoogle}
      retornoGoogle={retornoGoogle}
    />
  );
}
