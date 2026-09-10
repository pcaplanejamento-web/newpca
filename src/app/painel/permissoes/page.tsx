import { AcessoRestrito } from "@/components/AcessoRestrito";
import { EmConstrucao } from "@/components/EmConstrucao";
import { IconShield } from "@/components/icons";
import { getUsuarioAtual } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PermissoesPage() {
  const u = await getUsuarioAtual();
  if (!u || u.role !== "admin") {
    return <AcessoRestrito mensagem="Somente administradores gerenciam permissões." />;
  }
  return (
    <EmConstrucao
      titulo="Permissões"
      descricao="O que cada papel pode ver e editar."
      icon={<IconShield className="h-8 w-8" />}
      fase="Fase 2"
      itens={[
        "Matriz papel × capacidade por módulo",
        "Ajuste fino de acesso (admin/gestor/membro)",
      ]}
    />
  );
}
