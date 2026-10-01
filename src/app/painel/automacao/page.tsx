import { AcessoRestrito } from "@/components/AcessoRestrito";
import { AutomacaoAdmin } from "@/components/AutomacaoAdmin";
import { getUsuarioAtual } from "@/lib/auth";
import { protocolosParaAutomacao } from "@/lib/automacao";
import { contextoBanners } from "@/lib/mesa-dados";

export const dynamic = "force-dynamic";

export default async function AutomacaoPage() {
  const atual = await getUsuarioAtual();
  if (!atual?.admin) return <AcessoRestrito mensagem="Somente administradores podem acessar a automação." />;
  const [protocolos, ctx] = await Promise.all([protocolosParaAutomacao(), contextoBanners(atual)]);
  // Os banners da Mesa (o protocolo aberto pela linha) com o MESMO contexto da Mesa.
  return <AutomacaoAdmin protocolos={protocolos} banners={{ pode: ctx.pode, reparticoes: ctx.reparticoes, regras: ctx.regras, orgaos: ctx.orgaos, pcas: ctx.pcas }} />;
}
