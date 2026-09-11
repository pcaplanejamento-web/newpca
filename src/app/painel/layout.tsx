import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getUsuarioAtual } from "@/lib/auth";
import { abasPermitidas, getGrupoAtivo, gruposDoUsuario } from "@/lib/grupos";

export const dynamic = "force-dynamic";

export default async function PainelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const usuario = await getUsuarioAtual();
  if (!usuario) redirect("/login");

  const [grupos, ativo] = await Promise.all([gruposDoUsuario(usuario.id), getGrupoAtivo(usuario)]);
  const abas = [...(await abasPermitidas(usuario, ativo))];

  return (
    <AppShell usuario={usuario} grupos={grupos} grupoAtivoId={ativo?.id ?? null} abas={abas}>
      {children}
    </AppShell>
  );
}
