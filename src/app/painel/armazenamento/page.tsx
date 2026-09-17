import { AcessoRestrito } from "@/components/AcessoRestrito";
import { ArmazenamentoAdmin } from "@/components/ArmazenamentoAdmin";
import { getUsuarioAtual } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ArmazenamentoPage() {
  const atual = await getUsuarioAtual();
  if (atual?.role !== "admin") {
    return <AcessoRestrito mensagem="Somente administradores podem ver o armazenamento." />;
  }
  return <ArmazenamentoAdmin />;
}
