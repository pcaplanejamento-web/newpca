import { redirect } from "next/navigation";
import { RecuperarSenhaForm } from "@/components/RecuperarSenhaForm";
import { getUsuarioAtual } from "@/lib/auth";
import { getIntegracoes } from "@/lib/integracoes";
import { turnstileConfigurado } from "@/lib/integracoes-core";

export const dynamic = "force-dynamic";

/** "Esqueci a senha" — logado, a troca é no Perfil. */
export default async function RecuperarSenhaPage() {
  if (await getUsuarioAtual()) redirect("/painel/perfil");
  const integ = await getIntegracoes();
  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface-2 p-4">
      <RecuperarSenhaForm turnstile={{ enabled: turnstileConfigurado(integ), siteKey: integ.turnstile.siteKey }} />
    </main>
  );
}
