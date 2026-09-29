import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getUsuarioAtual } from "@/lib/auth";
import { getIntegracoes } from "@/lib/integracoes";
import { googleConfigurado, turnstileConfigurado } from "@/lib/integracoes-core";
import { mensagemErroLogin } from "@/lib/google-oauth-core";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string | string[] }> }) {
  if (await getUsuarioAtual()) redirect("/painel");
  const integ = await getIntegracoes();
  const turnstile = { enabled: turnstileConfigurado(integ), siteKey: integ.turnstile.siteKey };
  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface-2 p-4">
      <AuthForm mode="login" turnstile={turnstile} google={googleConfigurado(integ)} erroInicial={mensagemErroLogin((await searchParams).erro)} />
    </main>
  );
}
