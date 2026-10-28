import { redirect } from "next/navigation";
import { getUsuarioAtual } from "@/lib/auth";
import { linkImportacoes } from "@/lib/empenho-cards-core";
import { getCard } from "@/lib/empenho-cards";

export const dynamic = "force-dynamic";

// O antigo ESPAÇO de um card (pagamentos): as importações moram em Configurações → Importações (só o ADM — vai direto ao card);
// os demais vão aos dados (a tabela única, com a coluna Card).
export default async function CardAntigoPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const u = await getUsuarioAtual();
  const card = u?.admin && Number.isInteger(id) && id > 0 ? await getCard(id) : null;
  redirect(card ? linkImportacoes(card.tipo, card.id) : "/painel/pagamentos");
}
