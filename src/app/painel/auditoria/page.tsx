import { AcessoRestrito } from "@/components/AcessoRestrito";
import { EmConstrucao } from "@/components/EmConstrucao";
import { IconClipboard } from "@/components/icons";
import { getUsuarioAtual } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AuditoriaPage() {
  const u = await getUsuarioAtual();
  if (!u || u.role !== "admin") {
    return <AcessoRestrito mensagem="Somente administradores acessam a auditoria." />;
  }
  return (
    <EmConstrucao
      titulo="Auditoria"
      descricao="Registro de quem fez o quê na plataforma."
      icon={<IconClipboard className="h-8 w-8" />}
      fase="Fase 3"
      itens={[
        "Log de login, criações, edições e exclusões",
        "Filtros por usuário, entidade e período",
      ]}
    />
  );
}
