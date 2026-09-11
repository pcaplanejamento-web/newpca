import { AcessoRestrito } from "@/components/AcessoRestrito";
import { UsuariosAdmin } from "@/components/UsuariosAdmin";
import { getUsuarioAtual } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const atual = await getUsuarioAtual();

  if (atual?.role !== "admin") {
    return <AcessoRestrito mensagem="Somente administradores podem gerenciar usuários." />;
  }

  return <UsuariosAdmin meuId={atual.id} />;
}
