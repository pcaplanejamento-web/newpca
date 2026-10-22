import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NomearAparelho } from "@/components/NomearAparelho";
import { getAparencia } from "@/lib/aparencia";
import { estadoAparelhos } from "@/lib/aparelhos";
import { getUsuarioAtual } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** NOMEAR o aparelho (fora do painel): o 1º acesso, um aparelho desconhecido — ou a troca, com a conta lotada. */
export default async function AcessoAparelhoPage() {
  const u = await getUsuarioAtual();
  if (!u) redirect("/login");
  if (!u.pendencia.nomearAparelho) redirect(u.pendencia.termo === "bloqueado" ? "/acesso/termo" : "/painel");
  const [aparencia, estado] = await Promise.all([getAparencia(), estadoAparelhos(u, (await headers()).get("user-agent"))]);
  return <NomearAparelho estado={estado} identidade={aparencia.identidade} nome={u.nome} />;
}
