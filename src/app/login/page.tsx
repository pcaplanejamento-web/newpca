import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getUsuarioAtual } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getUsuarioAtual()) redirect("/painel");
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4 dark:bg-slate-950">
      <AuthForm mode="login" />
    </main>
  );
}
