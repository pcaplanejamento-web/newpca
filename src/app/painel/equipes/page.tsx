import { AcessoRestrito } from "@/components/AcessoRestrito";
import { EmConstrucao } from "@/components/EmConstrucao";
import { IconUsers } from "@/components/icons";
import { getUsuarioAtual } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function EquipesPage() {
  const u = await getUsuarioAtual();
  if (!u || (u.role !== "admin" && u.role !== "gestor")) {
    return <AcessoRestrito mensagem="Somente gestores e administradores gerenciam equipes." />;
  }
  return (
    <EmConstrucao
      titulo="Equipes"
      descricao="Setores/secretarias e seus membros."
      icon={<IconUsers className="h-8 w-8" />}
      fase="Fase 2"
      itens={[
        "Criar equipes e vincular usuários",
        "Filtrar protocolos por equipe",
      ]}
    />
  );
}
