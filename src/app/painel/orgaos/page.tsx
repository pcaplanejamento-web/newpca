import { AcessoRestrito } from "@/components/AcessoRestrito";
import { OrgaosAdmin } from "@/components/OrgaosAdmin";
import { getUsuarioAtual } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function OrgaosPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const atual = await getUsuarioAtual();
  if (!atual?.admin) {
    return <AcessoRestrito mensagem="Somente administradores podem gerenciar órgãos." />;
  }
  const { aba } = await searchParams;
  return <OrgaosAdmin abaInicial={aba === "responsaveis" ? "responsaveis" : "orgaos"} />;
}
