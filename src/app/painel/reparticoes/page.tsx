import { AcessoRestrito } from "@/components/AcessoRestrito";
import { ReparticoesAdmin } from "@/components/ReparticoesAdmin";
import { getUsuarioAtual } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ReparticoesPage() {
  const atual = await getUsuarioAtual();
  if (atual?.role !== "admin") {
    return <AcessoRestrito mensagem="Somente administradores podem gerenciar repartições." />;
  }
  return <ReparticoesAdmin />;
}
