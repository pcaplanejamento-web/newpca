import { AcessoRestrito } from "@/components/AcessoRestrito";
import { ConfiguracoesAdmin } from "@/components/ConfiguracoesAdmin";
import { getAparencia } from "@/lib/aparencia";
import { getUsuarioAtual } from "@/lib/auth";
import { listarPcas } from "@/lib/dfd";

export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage() {
  const u = await getUsuarioAtual();
  if (u?.role !== "admin") {
    return <AcessoRestrito mensagem="Somente administradores podem acessar as configurações." />;
  }

  const [aparencia, pcas] = await Promise.all([getAparencia(), listarPcas()]);
  return <ConfiguracoesAdmin identidade={aparencia.identidade} pcas={pcas} />;
}
