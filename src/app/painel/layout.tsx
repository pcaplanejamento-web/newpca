import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ConfigTabelas } from "@/components/ConfigTabelas";
import { getAcesso } from "@/lib/acesso";
import { getAparencia } from "@/lib/aparencia";
import { getReparticaoContexto } from "@/lib/grupos";
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
  const [contexto, pcaFiltro, notificacoes] = await Promise.all([
    getReparticaoContexto(usuario, ativo),
    getPcaFiltro(pcas),
    contarNaoLidas(usuario, grupos),
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
      notificacoes={notificacoes}
      versaoDados={versao}
    >
      {/* As tabelas da área logada abrem com as linhas por página escolhidas pelo ADM (Configurações → Tabelas). */}
      <ConfigTabelas linhas={linhasTabela(aparencia)} quem={`${usuario.nome}${usuario.matricula ? ` (matrícula ${usuario.matricula})` : ""}`}>
        {children}
      </ConfigTabelas>
    </AppShell>
  );
}
