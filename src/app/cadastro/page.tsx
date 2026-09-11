import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getUsuarioAtual } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function CadastroPage() {
  if (await getUsuarioAtual()) redirect("/painel");
  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface-2 p-4">
      <AuthForm mode="cadastro" />
    </main>
  );
}
