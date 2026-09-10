import { EmConstrucao } from "@/components/EmConstrucao";
import { IconActivity } from "@/components/icons";

export const dynamic = "force-dynamic";

export default function AtividadesPage() {
  return (
    <EmConstrucao
      titulo="Atividades"
      descricao="Acompanhe o que está acontecendo na plataforma."
      icon={<IconActivity className="h-8 w-8" />}
      fase="Fase 3"
      itens={[
        "Feed de ações da equipe (criação e edição de protocolos)",
        "Filtros por período e por responsável",
      ]}
    />
  );
}
