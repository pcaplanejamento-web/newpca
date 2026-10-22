import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { usuarios } from "@/db/schema";
import { AceiteTermo } from "@/components/AceiteTermo";
import { getAparencia } from "@/lib/aparencia";
import { getUsuarioAtual } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { SENHA_INUTILIZAVEL } from "@/lib/google-oauth-core";
import { getIntegracoes } from "@/lib/integracoes";
import { resendConfigurado } from "@/lib/integracoes-core";
import { nomeDoSistema, pendenciaDe } from "@/lib/termo-uso";

export const dynamic = "force-dynamic";

/** O ACEITE do Termo de Uso (fora do painel — o layout do painel traz a pessoa quando a carência venceu). */
export default async function AcessoTermoPage() {
  const u = await getUsuarioAtual();
  if (!u) redirect("/login");
  if (u.pendencia.nomearAparelho) redirect("/acesso/aparelho");
  const p = u.pendencia.termo === "ok" ? null : await pendenciaDe(u.id);
  if (!p?.termo.textoFinal || !p.termo.hash) redirect("/painel");
  const [aparencia, integ, sistema, [conta]] = await Promise.all([
    getAparencia(),
    getIntegracoes(),
    nomeDoSistema(),
    getDb().select({ senhaHash: usuarios.senhaHash }).from(usuarios).where(eq(usuarios.id, u.id)).limit(1),
  ]);
  return (
    <AceiteTermo
      termo={{ id: p.termo.id, versao: p.termo.versao, titulo: p.termo.titulo, texto: p.termo.textoFinal, hash: p.termo.hash, publicadoEm: p.termo.publicadoEm }}
      prazo={p.prazo}
      metodos={{ senha: !!conta?.senhaHash && conta.senhaHash !== SENHA_INUTILIZAVEL, codigo: resendConfigurado(integ) }}
      email={u.email}
      identidade={aparencia.identidade}
      sistema={sistema}
      bloqueado={u.pendencia.termo === "bloqueado"}
    />
  );
}
