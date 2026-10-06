import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ConfigTabelas } from "@/components/ConfigTabelas";
import { getAcesso } from "@/lib/acesso";
import { getAparencia } from "@/lib/aparencia";
import { getReparticaoContexto } from "@/lib/grupos";
import { getPcaFiltro, pcasDoFiltro } from "@/lib/pca-filtro";
import { contarNaoLidas } from "@/lib/notificacoes";
import { getConfigPresenca, prefsPresencaDe } from "@/lib/presenca";
import { ficaInvisivel } from "@/lib/presenca-core";
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

  const [aparencia, pcas, versao] = await Promise.all([
    getAparencia(),
    pcasDoFiltro(),
    // A versão dos dados: o `SincronizarDados` só recarrega a tela quando ela muda (falhou = sem sincronização).
    versaoDados().catch(() => undefined),
  ]);
  const [contexto, pcaFiltro, notificacoes, presenca] = await Promise.all([
    getReparticaoContexto(usuario, ativo),
    getPcaFiltro(pcas),
    contarNaoLidas(usuario, grupos),
    presencaDoGrupo(usuario.id, ativo?.id ?? null),
  ]);

  return (
    <AppShell
      usuario={usuario}
      grupos={grupos.map((g) => ({ id: g.id, nome: g.nome }))}
      grupoAtivoId={ativo?.id ?? null}
      abas={acesso.telas}
      reparticoes={contexto.lista}
      reparticaoAtivaId={contexto.ativa?.id ?? null}
      pcas={pcas}
      pcaFiltroId={pcaFiltro?.id ?? null}
      identidade={aparencia.identidade}
      notificacoes={notificacoes ?? 0}
      versaoDados={versao}
      presenca={presenca}
    >
      {/* As tabelas da área logada abrem com as linhas por página escolhidas pelo ADM (Configurações → Tabelas). */}
      <ConfigTabelas linhas={linhasTabela(aparencia)} quem={`${usuario.nome}${usuario.matricula ? ` (matrícula ${usuario.matricula})` : ""}`}>
        {children}
      </ConfigTabelas>
    </AppShell>
  );
}

/** A PRESENÇA do grupo ativo (quem está online): só com o ADM tendo ligado e um grupo ativo — o diretório (foto + apelido)
 * vai uma vez; o canal manda só ids. Desligada ou falhou = `null` (nada é montado). */
async function presencaDoGrupo(usuarioId: number, grupoId: number | null) {
  if (grupoId == null) return null;
  const cfg = await getConfigPresenca();
  if (!cfg.ativo) return null;
  try {
    const [pessoas, prefs] = await Promise.all([listarPessoasDoGrupo(grupoId), prefsPresencaDe(usuarioId)]);
    return { pessoas, invisivel: ficaInvisivel(cfg, prefs) };
  } catch {
    return null;
  }
}
