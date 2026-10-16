import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ComponentesPapel } from "@/components/ComponentesPapel";
import { ConfigTabelas } from "@/components/ConfigTabelas";
import { UnidadeUnica } from "@/components/UnidadeUnica";
import { getConfigEscopo } from "@/lib/escopo-cabecalho";
import { nomesDasSiglas } from "@/lib/reparticoes";
import { ProtecaoDados } from "@/components/ProtecaoDados";
import { SegundoPlano } from "@/components/SegundoPlano";
import { getAcesso } from "@/lib/acesso";
import { getAparencia } from "@/lib/aparencia";
import { dataHoraBR } from "@/lib/format";
import { getReparticaoContexto } from "@/lib/grupos";
import { getPcaFiltro, pcasDoFiltro } from "@/lib/pca-filtro";
import { getModulos } from "@/lib/modulos";
import { secoesDosModulos } from "@/lib/modulos-core";
import { getConfigProtecao } from "@/lib/protecao";
import { protecaoDoPapel } from "@/lib/protecao-core";
import { contarNaoLidas } from "@/lib/notificacoes";
import { getConfigChat, getConfigPresenca, prefsPresencaDe, whatsappDe } from "@/lib/presenca";
import { chatLigado } from "@/lib/chat-core";
import { linhasTabela } from "@/lib/theme";
import { listarPessoasDoGrupo } from "@/lib/usuarios";
import { versaoDados } from "@/lib/versao-dados";

export const dynamic = "force-dynamic";

export default async function PainelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // O ACESSO (grupos + permissões + o papel, numa consulta memorizada): as telas do menu são as EFETIVAS — o grupo ativo
  // libera e o papel visualiza (o ADM, todas).
  const acesso = await getAcesso();
  if (!acesso) redirect("/login");
  const { u: usuario, grupos, grupoAtivo: ativo } = acesso;
  // O ADM exigiu uma senha nova: nenhuma tela do painel antes de criá-la.
  if (usuario.trocarSenha) redirect("/nova-senha");

  const [aparencia, pcas, versao, protecaoCfg, modulos, nomesSiglas] = await Promise.all([
    getAparencia(),
    pcasDoFiltro(),
    // A versão dos dados: o `SincronizarDados` só recarrega a tela quando ela muda (falhou = sem sincronização).
    versaoDados().catch(() => undefined),
    getConfigProtecao(),
    getModulos(),
    nomesDasSiglas().catch(() => ({})),
  ]);
  // A PROTEÇÃO DE DADOS do ADM (seleção/cópia, impressão/captura): só nos papéis que ele escolheu.
  const protecao = protecaoDoPapel(protecaoCfg, usuario.papel.id);
  const [contexto, pcaFiltro, notificacoes, presenca, configChat, escopoCab] = await Promise.all([
    getReparticaoContexto(usuario, ativo),
    getPcaFiltro(pcas),
    contarNaoLidas(usuario, grupos),
    // O PAPEL vê quem está online? (Papéis → Detalhes → Presença; o ADM sempre vê.)
    presencaDoGrupo(usuario.id, ativo?.id ?? null, usuario.admin || usuario.papel.detalhes.presenca.verOnline),
    getConfigChat(),
    getConfigEscopo(),
  ]);

  return (
    <AppShell
      usuario={usuario}
      grupos={grupos.map((g) => ({ id: g.id, nome: g.nome }))}
      grupoAtivoId={ativo?.id ?? null}
      abas={acesso.telas}
      // O menu: uma seção por MÓDULO (Configurações → Módulos), só as telas abertas; o ADM vê também as telas sem módulo.
      modulos={secoesDosModulos(modulos, new Set(acesso.telas), usuario.admin)}
      reparticoes={contexto.lista}
      reparticaoAtivaId={contexto.ativa?.id ?? null}
      pcas={pcas}
      pcaFiltroId={pcaFiltro?.id ?? null}
      identidade={aparencia.identidade}
      notificacoes={notificacoes ?? 0}
      versaoDados={versao}
      presenca={presenca}
      // O chat ao vivo vive no canal da presença: sem ela, sem o chat.
      // `undefined` = a leitura FALHOU (o AppShell mantém o que já estava): uma falha passageira nunca desmonta o canal e o chat.
      // O GRUPO ativo também libera (ou não) o chat — Grupos → "Chat liberado".
      chat={presenca === undefined || configChat === null ? undefined : presenca && ativo?.chat && chatLigado(configChat) ? configChat : null}
    >
      {protecao && <ProtecaoDados {...protecao} quem={`${usuario.nome}${usuario.matricula ? ` · matrícula ${usuario.matricula}` : ""} · ${dataHoraBR(new Date().toISOString())}`} />}
      {/* As tabelas da área logada abrem com as linhas por página escolhidas pelo ADM (Configurações → Tabelas). */}
      <ConfigTabelas linhas={linhasTabela(aparencia)} nomesUnidades={nomesSiglas} quem={`${usuario.nome}${usuario.matricula ? ` (matrícula ${usuario.matricula})` : ""}`}>
        {/* Trabalhos em segundo plano (automações): seguem ao trocar de tela, minimizados no canto inferior direito. */}
        <ComponentesPapel retirados={usuario.admin ? {} : usuario.papel.detalhes.componentes} exibicao={usuario.papel.detalhes.exibicao}>
          <UnidadeUnica
            modulos={escopoCab.modulos}
            unidade={
              contexto.ativa && contexto.ativa.codigo !== "GERAL"
                ? { id: contexto.ativa.id, sigla: contexto.ativa.codigo, nome: contexto.ativa.nome }
                : null
            }
          >
            <SegundoPlano>{children}</SegundoPlano>
          </UnidadeUnica>
        </ComponentesPapel>
      </ConfigTabelas>
    </AppShell>
  );
}

/** A PRESENÇA do grupo ativo (quem está online): só com o ADM tendo ligado e um grupo ativo — o diretório (foto + apelido)
 * vai uma vez; o canal manda só ids. Desligada = `null` (nada é montado); a leitura FALHOU = `undefined` (a tela mantém a
 * presença que já tinha — nunca derruba o canal nem as conversas por uma falha passageira). */
async function presencaDoGrupo(usuarioId: number, grupoId: number | null, ver: boolean) {
  if (grupoId == null) return null;
  const cfg = await getConfigPresenca();
  if (!cfg.ativo) return null;
  try {
    const [pessoas, prefs] = await Promise.all([listarPessoasDoGrupo(grupoId), prefsPresencaDe(usuarioId)]);
    return {
      pessoas,
      ver,
      whatsapp: await whatsappDe(pessoas.map((p) => p.id)),
      invisivel: false,
      inativoMin: cfg.inativoMin,
      status: { status: prefs.status, recado: prefs.recado, ate: prefs.ate },
    };
  } catch {
    return undefined;
  }
}
