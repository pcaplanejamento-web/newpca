import { AcessoRestrito } from "@/components/AcessoRestrito";
import { OrgaosAdmin } from "@/components/OrgaosAdmin";
import { getUsuarioAtual } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function OrgaosPage() {
  const atual = await getUsuarioAtual();
  if (atual?.role !== "admin") {
    return <AcessoRestrito mensagem="Somente administradores podem gerenciar órgãos." />;
  }
  return <OrgaosAdmin />;
}
