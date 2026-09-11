import { AcessoRestrito } from "@/components/AcessoRestrito";
import { PermissoesAdmin } from "@/components/PermissoesAdmin";
import { getUsuarioAtual } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PermissoesPage() {
  const atual = await getUsuarioAtual();
  if (atual?.role !== "admin") {
    return <AcessoRestrito mensagem="Somente administradores podem gerenciar permissões." />;
  }
  return <PermissoesAdmin />;
}
