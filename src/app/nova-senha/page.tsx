import { redirect } from "next/navigation";
import { NovaSenhaObrigatoria } from "@/components/NovaSenhaObrigatoria";
import { getAparencia } from "@/lib/aparencia";
import { getUsuarioAtual } from "@/lib/auth";
import { getIntegracoes } from "@/lib/integracoes";
import { turnstileConfigurado } from "@/lib/integracoes-core";

export const dynamic = "force-dynamic";

/** A TROCA DE SENHA OBRIGATÓRIA (o ADM exigiu): fora do painel — o layout do painel traz a pessoa para cá. */
export default async function NovaSenhaPage() {
  const u = await getUsuarioAtual();
  if (!u) redirect("/login");
  if (!u.trocarSenha) redirect("/painel");
  const [aparencia, integ] = await Promise.all([getAparencia(), getIntegracoes()]);
  return (
    <NovaSenhaObrigatoria
      email={u.email}
      identidade={aparencia.identidade}
      turnstile={{ enabled: turnstileConfigurado(integ), siteKey: integ.turnstile.siteKey }}
    />
  );
}
