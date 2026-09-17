import { AcessoRestrito } from "@/components/AcessoRestrito";
import { AuditoriaAdmin } from "@/components/AuditoriaAdmin";
import { getUsuarioAtual } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AuditoriaPage() {
  const atual = await getUsuarioAtual();
  if (atual?.role !== "admin") {
    return <AcessoRestrito mensagem="Somente administradores podem ver a auditoria." />;
  }
  return <AuditoriaAdmin />;
}
