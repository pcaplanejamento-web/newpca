import { AcessoRestrito } from "@/components/AcessoRestrito";
import { IntegracoesAdmin } from "@/components/IntegracoesAdmin";
import { getUsuarioAtual } from "@/lib/auth";
import { getIntegracoes } from "@/lib/integracoes";
import { toView } from "@/lib/integracoes-core";
import { temChaveMestra } from "@/lib/integracoes-segredos";

export const dynamic = "force-dynamic";

export default async function IntegracoesPage() {
  const atual = await getUsuarioAtual();
  if (atual?.role !== "admin") {
    return <AcessoRestrito mensagem="Somente administradores podem acessar as integrações." />;
  }
  const integracoes = toView(await getIntegracoes(), temChaveMestra());
  return <IntegracoesAdmin integracoes={integracoes} />;
}
