import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ConfigTabelas } from "@/components/ConfigTabelas";
import { getAparencia } from "@/lib/aparencia";
import { getUsuarioAtual } from "@/lib/auth";
import { abasPermitidas, getGrupoAtivo, getReparticaoContexto, gruposDoUsuario } from "@/lib/grupos";
import { getPcaFiltro, pcasDoFiltro } from "@/lib/pca-filtro";
import { contarNaoLidas } from "@/lib/notificacoes";
import { linhasTabela } from "@/lib/theme";

export const dynamic = "force-dynamic";

export default async function PainelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const usuario = await getUsuarioAtual();
  if (!usuario) redirect("/login");

  const [grupos, ativo, aparencia, pcas] = await Promise.all([
    gruposDoUsuario(usuario.id),
    getGrupoAtivo(usuario),
    getAparencia(),
    pcasDoFiltro(),
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
    >
      {/* As tabelas da área logada abrem com as linhas por página escolhidas pelo ADM (Configurações → Tabelas). */}
      <ConfigTabelas linhas={linhasTabela(aparencia)}>{children}</ConfigTabelas>
    </AppShell>
  );
}
