import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { reparticoes, usuarios } from "@/db/schema";
import { type IdentidadePerfil, PerfilView } from "@/components/PerfilView";
import { getAcesso, podeTela, visaoDoAcesso } from "@/lib/acesso";
import type { UsuarioSessao } from "@/lib/auth";
import { CHAVE_PREF_EMAIL, lerPrefsEmail } from "@/lib/email-core";
import { getIntegracoes } from "@/lib/integracoes";
import { googleConfigurado, resendConfigurado, turnstileConfigurado } from "@/lib/integracoes-core";
import { getDb } from "@/lib/db";
import { mensagemVinculo, SENHA_INUTILIZAVEL } from "@/lib/google-oauth-core";
import { pessoasDesignaveis, type VisaoMesa } from "@/lib/mesa-visao-core";
import { ACOES_PAPEL, type Capacidades, motivoSemModulos } from "@/lib/papeis-core";
import { listarPreferenciasTabela } from "@/lib/preferencias-tabela";
import { listarPessoasDoGrupo, mesaResponsavelGravado, pessoasPorIds, responsavelPadraoGravado } from "@/lib/usuarios";

export const dynamic = "force-dynamic";

/** Protocolação (só quem protocola — editores): o responsável padrão escolhido automaticamente, entre as PESSOAS DO
 * GRUPO ativo (o gravado que saiu do grupo aparece à parte — com a foto —, só para trocar/remover). O papel que "só assume
 * para si" oferece só a própria pessoa (o padrão de outra pessoa não entra ao protocolar — `padraoAoProtocolar`). */
async function protocolacaoDe(u: UsuarioSessao, grupoId: number | null, vis: VisaoMesa) {
  // Sem grupo ativo, todas as pessoas só para o ADM.
  const [doGrupo, responsavelPadraoId] = await Promise.all([
    grupoId == null && !u.admin ? Promise.resolve([]) : listarPessoasDoGrupo(grupoId),
    responsavelPadraoGravado(u.id),
  ]);
  const pessoas = pessoasDesignaveis(vis, u.id, doGrupo);
  const fora = responsavelPadraoId != null && !pessoas.some((p) => p.id === responsavelPadraoId) ? (await pessoasPorIds([responsavelPadraoId]))[0] : null;
  return { pessoas, responsavelPadraoId, foraDoGrupo: fora ?? null, soVoce: vis.responsavel.alterar === "si" };
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

/** A identificação institucional (só leitura) + o que a conta tem: unidade, cargo, e-mail confirmado, senha e a conta Google. */
async function identidadeDe(usuarioId: number): Promise<IdentidadePerfil> {
  const [r] = await getDb()
    .select({ unidade: reparticoes.nome, cargo: usuarios.cargo, verificado: usuarios.emailVerificadoEm, senha: usuarios.senhaHash, googleEmail: usuarios.googleEmail })
    .from(usuarios)
    .leftJoin(reparticoes, eq(reparticoes.id, usuarios.reparticaoId))
    .where(eq(usuarios.id, usuarioId))
    .limit(1);
  return { unidade: r?.unidade ?? null, cargo: r?.cargo ?? null, emailVerificado: !!r?.verificado, semSenha: r?.senha === SENHA_INUTILIZAVEL, googleEmail: r?.googleEmail ?? null };
}

export default async function PerfilPage({ searchParams }: { searchParams: Promise<{ google?: string | string[]; motivo?: string | string[] }> }) {
  const acesso = await getAcesso();
  if (!acesso) redirect("/login");
  const { u, grupoAtivo: grupo } = acesso;
  // A Protocolação (responsável padrão) é de quem IMPORTA na Mesa e pode pôr um Responsável (os DETALHES do papel).
  const vis = visaoDoAcesso(acesso);
  const protocola = podeTela(acesso, "dfd").importar && vis.responsavel.ver && vis.responsavel.alterar !== "nao";
  const sp = await searchParams;
  const retornoGoogle = mensagemVinculo(sp.google, sp.motivo);
  const [protocolacao, mesaResponsavel, avisosEmail, identidade, integ] = await Promise.all([
    protocola ? protocolacaoDe(u, grupo?.id ?? null, vis) : null,
    mesaResponsavelGravado(u.id),
    avisosEmailDe(u.id),
    identidadeDe(u.id),
    getIntegracoes(),
  ]);
  // A conta Google só com o login com Google ativo (sem ele, o card nem aparece).
  const contaGoogle = googleConfigurado(integ) ? { email: identidade.googleEmail, soGoogle: identidade.semSenha } : null;
  // O ACESSO efetivo no grupo ativo (as telas que abre × as ações de cada uma) + as RESTRIÇÕES do papel (os detalhes; o
  // Administrador não tem). Sem nenhuma tela, o `/painel` traz para cá — o Perfil diz por quê. A preferência da Mesa (com
  // que responsável ela abre) só para quem vê a Mesa e o Responsável.
  const efetivo: Capacidades = Object.fromEntries(acesso.telas.map((t) => [t, ACOES_PAPEL.filter((a) => podeTela(acesso, t)[a])]));
  const motivo = motivoSemModulos({ admin: u.admin, temGrupo: acesso.grupos.length > 0, abasDoGrupo: grupo?.abas ?? [], capacidades: u.papel.capacidades });
  const semModulos = motivo && acesso.grupos.length > 1 ? `${motivo} Você também pode trocar o grupo ativo no cabeçalho.` : motivo;
  return (
    <PerfilView
      usuario={u}
      identidade={identidade}
      turnstile={{ enabled: turnstileConfigurado(integ), siteKey: integ.turnstile.siteKey }}
      protocolacao={protocolacao}
      mesaResponsavel={acesso.telas.includes("dfd") && vis.responsavel.ver ? mesaResponsavel : null}
      mesaSoOsMeus={vis.linhas === "meus"}
      semModulos={semModulos}
      seuAcesso={{ grupo: grupo?.nome ?? null, capacidades: efetivo, detalhes: u.admin ? null : u.papel.detalhes }}
      avisosEmail={avisosEmail}
      contaGoogle={contaGoogle}
      retornoGoogle={retornoGoogle}
    />
  );
}
