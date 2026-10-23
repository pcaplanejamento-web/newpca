import { AcessoRestrito } from "@/components/AcessoRestrito";
import { IntegracoesAdmin } from "@/components/IntegracoesAdmin";
import { getUsuarioAtual } from "@/lib/auth";
import { getIntegracoes } from "@/lib/integracoes";
import { toView } from "@/lib/integracoes-core";
import { temChaveMestra } from "@/lib/integracoes-segredos";

export const dynamic = "force-dynamic";

export default async function IntegracoesPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const atual = await getUsuarioAtual();
  if (!atual?.admin) {
    return <AcessoRestrito mensagem="Somente administradores podem acessar as integrações." />;
  }
  const integracoes = toView(await getIntegracoes(), temChaveMestra());
  const aba = (await searchParams).aba === "centi" ? "centi" : "servicos";
  return <IntegracoesAdmin integracoes={integracoes} abaInicial={aba} />;
}
