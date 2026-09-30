import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getUsuarioAtual } from "@/lib/auth";
import { getIntegracoes } from "@/lib/integracoes";
import { googleConfigurado, turnstileConfigurado } from "@/lib/integracoes-core";
import { COOKIE_GOOGLE_CONTA, lerContaLembrada, mensagemErroLogin } from "@/lib/google-oauth-core";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string | string[]; motivo?: string | string[] }> }) {
  if (await getUsuarioAtual()) redirect("/painel");
  const integ = await getIntegracoes();
  const sp = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface-2 p-4">
      <AuthForm
        turnstile={{ enabled: turnstileConfigurado(integ), siteKey: integ.turnstile.siteKey }}
        google={googleConfigurado(integ)}
        googleConta={lerContaLembrada((await cookies()).get(COOKIE_GOOGLE_CONTA)?.value)}
        erroInicial={mensagemErroLogin(sp.erro, sp.motivo)}
      />
    </main>
  );
}
