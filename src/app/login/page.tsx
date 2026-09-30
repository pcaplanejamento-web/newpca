import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { TelaAcesso } from "@/components/TelaAcesso";
import { getAparencia } from "@/lib/aparencia";
import { contarUsuarios, getUsuarioAtual } from "@/lib/auth";
import { COOKIE_GOOGLE_CONTA, lerContaLembrada, mensagemErroLogin } from "@/lib/google-oauth-core";
import { getIntegracoes } from "@/lib/integracoes";
import { googleConfigurado, turnstileConfigurado } from "@/lib/integracoes-core";
import { lerModoAcesso } from "@/lib/modo-acesso";
import { listarUnidadesTrabalho } from "@/lib/reparticoes";

export const dynamic = "force-dynamic";

type Busca = { modo?: string | string[]; erro?: string | string[]; motivo?: string | string[] };

/** A TELA ÚNICA de acesso: entrar, criar conta (`?modo=cadastro`) e redefinir a senha (`?modo=senha`). */
export default async function LoginPage({ searchParams }: { searchParams: Promise<Busca> }) {
  if (await getUsuarioAtual()) redirect("/painel");
  const [sp, integ, aparencia, unidades, total, jar] = await Promise.all([
    searchParams,
    getIntegracoes(),
    getAparencia(),
    listarUnidadesTrabalho(),
    contarUsuarios(),
    cookies(),
  ]);
  return (
    <TelaAcesso
      modoInicial={lerModoAcesso(sp.modo)}
      identidade={aparencia.identidade}
      turnstile={{ enabled: turnstileConfigurado(integ), siteKey: integ.turnstile.siteKey }}
      google={googleConfigurado(integ)}
      googleConta={lerContaLembrada(jar.get(COOKIE_GOOGLE_CONTA)?.value)}
      unidades={unidades}
      semCodigo={total === 0}
      erroInicial={mensagemErroLogin(sp.erro, sp.motivo)}
    />
  );
}
