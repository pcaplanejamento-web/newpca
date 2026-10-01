import { AcessoRestrito } from "@/components/AcessoRestrito";
import { AutomacaoAdmin } from "@/components/AutomacaoAdmin";
import { getUsuarioAtual } from "@/lib/auth";
import { protocolosParaAutomacao } from "@/lib/automacao";

export const dynamic = "force-dynamic";

export default async function AutomacaoPage() {
  const atual = await getUsuarioAtual();
  if (!atual?.admin) return <AcessoRestrito mensagem="Somente administradores podem acessar a automação." />;
  return <AutomacaoAdmin protocolos={await protocolosParaAutomacao()} />;
}
