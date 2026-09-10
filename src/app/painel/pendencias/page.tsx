import { EmConstrucao } from "@/components/EmConstrucao";
import { IconClock } from "@/components/icons";

export const dynamic = "force-dynamic";

export default function PendenciasPage() {
  return (
    <EmConstrucao
      titulo="Pendências"
      descricao="O que precisa da sua atenção."
      icon={<IconClock className="h-8 w-8" />}
      fase="Fase 3"
      itens={[
        "Fila de protocolos em análise / devolvidos",
        "Prazos e alertas de acompanhamento",
      ]}
    />
  );
}
