import { redirect } from "next/navigation";
import { getUsuarioAtual } from "@/lib/auth";
import { linkImportacoes } from "@/lib/empenho-cards-core";
import { getCard } from "@/lib/empenho-cards";

export const dynamic = "force-dynamic";

// O antigo ESPAÇO de um card (liquidacoes): as importações moram em Configurações → Importações (só o ADM — vai direto ao card);
// os demais vão aos dados (a tabela única, com a coluna Card).
export default async function CardAntigoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string }> }) {
  const id = Number((await params).id);
  // A aba antiga do espaço vira a sub-aba do card (o link guardado abre no mesmo lugar).
  const { aba } = await searchParams;
  const sub = aba === "vinculos" || aba === "configuracao" ? aba : undefined;
  const u = await getUsuarioAtual();
  const card = u?.admin && Number.isInteger(id) && id > 0 ? await getCard(id) : null;
  redirect(card ? linkImportacoes(card.tipo, card.id, sub) : "/painel/liquidacoes");
}
