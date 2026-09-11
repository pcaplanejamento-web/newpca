import { AcessoRestrito } from "@/components/AcessoRestrito";
import { GruposAdmin } from "@/components/GruposAdmin";
import { getUsuarioAtual } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function GruposPage() {
  const atual = await getUsuarioAtual();
  if (atual?.role !== "admin") {
    return <AcessoRestrito mensagem="Somente administradores podem gerenciar grupos." />;
  }
  return <GruposAdmin />;
}
