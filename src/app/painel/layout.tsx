import { ehGeral } from "@/lib/escopo-unidades-core";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ComponentesPapel } from "@/components/ComponentesPapel";
import { ConfigTabelas } from "@/components/ConfigTabelas";
import { UnidadeUnica } from "@/components/UnidadeUnica";
import { getConfigEscopo } from "@/lib/escopo-cabecalho";
import { nomesDasSiglas } from "@/lib/reparticoes";
import { ProtecaoDados } from "@/components/ProtecaoDados";
import { SegundoPlano } from "@/components/SegundoPlano";
import { componentesDoAcesso, getAcesso } from "@/lib/acesso";
import { getAparencia } from "@/lib/aparencia";
import { dataHoraBR } from "@/lib/format";
import { acessosDoGrupo, getReparticaoContexto } from "@/lib/grupos";
import { partesDaChave } from "@/lib/escopo-unidades-core";
import { listarPcasCards } from "@/lib/pca-espaco";
import { getPcaFiltro, pcasDoFiltro } from "@/lib/pca-filtro";
import { getModulos } from "@/lib/modulos";
import { secoesDosModulos } from "@/lib/modulos-core";
import { getConfigProtecao } from "@/lib/protecao";
import { protecaoDoPapel } from "@/lib/protecao-core";
import { contarNaoLidas } from "@/lib/notificacoes";
import { getConfigChat, getConfigPresenca, prefsPresencaDe, whatsappDe } from "@/lib/presenca";
import { MAX_GRUPOS_OBSERVADOS } from "@/lib/presenca-core";
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
  // Os cartões do seletor de PCA do cabeçalho, na ordem e no acesso do filtro (os números memorizados por versão).
  const porId = pcas.length ? new Map((await listarPcasCards(null).catch(() => [])).map((c) => [c.id, c])) : new Map();
  const cartoesPca = pcas.flatMap((p) => porId.get(p.id) ?? []);
  // A PROTEÇÃO DE DADOS do ADM (seleção/cópia, impressão/captura): só nos papéis que ele escolheu.
  const protecao = protecaoDoPapel(protecaoCfg, usuario.papel.id);
  const [contexto, pcaFiltro, notificacoes, presenca, configChat, escopoCab] = await Promise.all([
    getReparticaoContexto(usuario, ativo),
    getPcaFiltro(pcas),
    contarNaoLidas(usuario, grupos),
    // O PAPEL vê quem está online? (Papéis → Detalhes → Presença; o ADM sempre vê.)
    presencaDoGrupo(usuario.id, ativo?.id ?? null, grupos, usuario.admin || usuario.papel.detalhes.presenca.verOnline, usuario.admin || usuario.papel.detalhes.presenca.visivel),
    getConfigChat(),
    getConfigEscopo(),
  ]);
  // Grupos → Acesso por aba: nas abas com TODAS as unidades o cabeçalho troca a lista (e a ativa); nas de SOMA, trava.
  const acessos = !usuario.admin && ativo ? await acessosDoGrupo(ativo.id) : { todas: [], somas: [] };
  const primeira = acessos.todas[0] ? partesDaChave(acessos.todas[0]) : null;
  const contextoTodas = primeira ? await getReparticaoContexto(usuario, ativo, primeira.tela, primeira.aba) : null;
  const telasTodas = acessos.todas;
  const unidadeDe = (r: { id: number; codigo: string; nome: string } | null) =>
    r && !ehGeral(r) ? { id: r.id, sigla: r.codigo, nome: r.nome } : null;

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
      unidadesPorTela={{ telas: telasTodas, travadas: acessos.somas, lista: contextoTodas?.lista ?? null, ativaId: contextoTodas?.ativa?.id ?? null }}
      pcas={pcas}
      pcaFiltroId={pcaFiltro?.id ?? null}
      cartoesPca={cartoesPca}
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
        <ComponentesPapel retirados={componentesDoAcesso(acesso)} exibicao={usuario.papel.detalhes.exibicao}>
          <UnidadeUnica
            modulos={escopoCab.modulos}
            unidade={unidadeDe(contexto.ativa)}
            porTela={contextoTodas ? { telas: telasTodas, unidade: unidadeDe(contextoTodas.ativa) } : undefined}
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
async function presencaDoGrupo(usuarioId: number, grupoId: number | null, grupos: { id: number; nome: string }[], ver: boolean, visivel: boolean) {
  if (grupoId == null) return null;
  const cfg = await getConfigPresenca();
  if (!cfg.ativo) return null;
  try {
    // Os OUTROS grupos da pessoa (só quando o papel vê quem está online): os membros de cada um — o painel junta os online de
    // todos, cada pessoa marcada com os grupos dela. Só os grupos em que a pessoa É membro (o ADM vê, mas não observa os demais).
    const outrosIds = ver ? grupos.filter((g) => g.id !== grupoId).slice(0, MAX_GRUPOS_OBSERVADOS) : [];
    const [pessoas, prefs, membrosOutros] = await Promise.all([
      listarPessoasDoGrupo(grupoId),
      prefsPresencaDe(usuarioId),
      Promise.all(outrosIds.map((g) => listarPessoasDoGrupo(g.id))),
    ]);
    const ativos = new Set(pessoas.map((p) => p.id));
    const diretorio = new Map<number, (typeof pessoas)[number]>();
    const outros = outrosIds.flatMap((g, i) => {
      const membros = membrosOutros[i];
      if (!membros.some((p) => p.id === usuarioId)) return [];
      for (const p of membros) if (!ativos.has(p.id)) diretorio.set(p.id, p);
      return [{ id: g.id, nome: g.nome, membros: membros.map((p) => p.id) }];
    });
    const extras = [...diretorio.values()];
    return {
      pessoas,
      ver,
      outros,
      diretorio: extras,
      whatsapp: await whatsappDe([...pessoas, ...extras].map((p) => p.id)),
      invisivel: !visivel,
      inativoMin: cfg.inativoMin,
      status: { status: prefs.status, recado: prefs.recado, ate: prefs.ate },
    };
  } catch {
    return undefined;
  }
}
