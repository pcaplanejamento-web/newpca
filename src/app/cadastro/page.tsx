import { redirect } from "next/navigation";
import { CadastroForm } from "@/components/CadastroForm";
import { contarUsuarios, getUsuarioAtual } from "@/lib/auth";
import { mensagemErroLogin } from "@/lib/google-oauth-core";
import { getIntegracoes } from "@/lib/integracoes";
import { turnstileConfigurado } from "@/lib/integracoes-core";
import { listarUnidadesTrabalho } from "@/lib/reparticoes";

export const dynamic = "force-dynamic";

export default async function CadastroPage({ searchParams }: { searchParams: Promise<{ erro?: string | string[] }> }) {
  if (await getUsuarioAtual()) redirect("/painel");
  const [integ, unidades, total, sp] = await Promise.all([getIntegracoes(), listarUnidadesTrabalho(), contarUsuarios(), searchParams]);
  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface-2 p-4">
      <CadastroForm
        unidades={unidades}
        turnstile={{ enabled: turnstileConfigurado(integ), siteKey: integ.turnstile.siteKey }}
        semCodigo={total === 0}
        erroInicial={mensagemErroLogin(sp.erro)}
      />
    </main>
  );
}
