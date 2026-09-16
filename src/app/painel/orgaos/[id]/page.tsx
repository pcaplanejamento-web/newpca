import { notFound } from "next/navigation";
import { AcessoRestrito } from "@/components/AcessoRestrito";
import { ReparticoesAdmin } from "@/components/ReparticoesAdmin";
import { getUsuarioAtual } from "@/lib/auth";
import { listarOrgaos } from "@/lib/orgaos";

export const dynamic = "force-dynamic";

/** Unidades de UM órgão (`/painel/orgaos/[id]`) — drill-down a partir da lista de órgãos. */
export default async function OrgaoUnidadesPage({ params }: { params: Promise<{ id: string }> }) {
  const atual = await getUsuarioAtual();
  if (atual?.role !== "admin") {
    return <AcessoRestrito mensagem="Somente administradores podem gerenciar unidades." />;
  }
  const orgaoId = Number((await params).id);
  if (!Number.isInteger(orgaoId) || orgaoId <= 0) notFound();
  const orgao = (await listarOrgaos()).find((o) => o.id === orgaoId);
  if (!orgao) notFound();
  return <ReparticoesAdmin orgaoId={orgao.id} orgaoNome={orgao.nome} />;
}
