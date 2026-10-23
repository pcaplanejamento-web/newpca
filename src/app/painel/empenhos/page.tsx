import { AcessoRestrito } from "@/components/AcessoRestrito";
import { EmpenhosAdmin } from "@/components/EmpenhosAdmin";
import { getUsuarioAtual } from "@/lib/auth";
import { carregarEdicoes } from "@/lib/edicoes-tabela";
import { anosEmpenhos } from "@/lib/empenhos-tela";
import { anoEscolhido } from "@/lib/empenhos-tela-core";

export const dynamic = "force-dynamic";

export default async function EmpenhosPage({ searchParams }: { searchParams: Promise<{ ano?: string }> }) {
  const atual = await getUsuarioAtual();
  if (!atual?.admin) {
    return <AcessoRestrito mensagem="Somente administradores podem ver os empenhos." />;
  }
  const [{ ano }, anos, edicoes] = await Promise.all([searchParams, anosEmpenhos(), carregarEdicoes(atual.id, "admin:empenhos:")]);
  return <EmpenhosAdmin anos={anos} anoInicial={anoEscolhido(anos, ano)} edicoes={edicoes} />;
}
