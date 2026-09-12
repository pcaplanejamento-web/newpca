import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getUsuarioAtual } from "@/lib/auth";
import { abasPermitidas, getGrupoAtivo, getReparticaoContexto, gruposDoUsuario } from "@/lib/grupos";

export const dynamic = "force-dynamic";

export default async function PainelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const usuario = await getUsuarioAtual();
  if (!usuario) redirect("/login");

  const [grupos, ativo] = await Promise.all([gruposDoUsuario(usuario.id), getGrupoAtivo(usuario)]);
  const [abas, contexto] = await Promise.all([
    abasPermitidas(usuario, ativo).then((s) => [...s]),
    getReparticaoContexto(usuario, ativo),
  ]);

  return (
    <AppShell
      usuario={usuario}
      grupos={grupos}
      grupoAtivoId={ativo?.id ?? null}
      abas={abas}
      reparticoes={contexto.lista}
      reparticaoAtivaId={contexto.ativa?.id ?? null}
    >
      {children}
    </AppShell>
  );
}
