import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ConfigTabelas } from "@/components/ConfigTabelas";
import { getAparencia } from "@/lib/aparencia";
import { getUsuarioAtual } from "@/lib/auth";
import { abasPermitidas, getGrupoAtivo, getReparticaoContexto, gruposDoUsuario } from "@/lib/grupos";
import { getPcaFiltro, pcasDoFiltro } from "@/lib/pca-filtro";
import { contarNaoLidas } from "@/lib/notificacoes";
import { linhasTabela } from "@/lib/theme";
import { versaoDados } from "@/lib/versao-dados";

export const dynamic = "force-dynamic";

export default async function PainelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const usuario = await getUsuarioAtual();
  if (!usuario) redirect("/login");
  // O ADM exigiu uma senha nova: nenhuma tela do painel antes de criá-la.
  if (usuario.trocarSenha) redirect("/nova-senha");

  const [grupos, ativo, aparencia, pcas, versao] = await Promise.all([
    gruposDoUsuario(usuario.id),
    getGrupoAtivo(usuario),
    getAparencia(),
    pcasDoFiltro(),
    // A versão dos dados: o `SincronizarDados` só recarrega a tela quando ela muda (falhou = sem sincronização).
    versaoDados().catch(() => undefined),
  ]);
  const [abas, contexto, pcaFiltro, notificacoes] = await Promise.all([
    abasPermitidas(usuario, ativo).then((s) => [...s]),
    getReparticaoContexto(usuario, ativo),
    getPcaFiltro(pcas),
    contarNaoLidas(usuario, grupos.map((g) => g.id)),
  ]);

  return (
    <AppShell
      usuario={usuario}
      grupos={grupos}
      grupoAtivoId={ativo?.id ?? null}
      abas={abas}
      reparticoes={contexto.lista}
      reparticaoAtivaId={contexto.ativa?.id ?? null}
      pcas={pcas}
      pcaFiltroId={pcaFiltro?.id ?? null}
      identidade={aparencia.identidade}
      notificacoes={notificacoes}
      versaoDados={versao}
    >
      {/* As tabelas da área logada abrem com as linhas por página escolhidas pelo ADM (Configurações → Tabelas). */}
      <ConfigTabelas linhas={linhasTabela(aparencia)}>{children}</ConfigTabelas>
    </AppShell>
  );
}
