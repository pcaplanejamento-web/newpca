import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getUsuarioAtual } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PainelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const usuario = await getUsuarioAtual();
  if (!usuario) redirect("/login");
  return <AppShell usuario={usuario}>{children}</AppShell>;
}
