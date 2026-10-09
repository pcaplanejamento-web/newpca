import { AcessoRestrito } from "@/components/AcessoRestrito";
import { OrgaosAdmin } from "@/components/OrgaosAdmin";
import { getUsuarioAtual } from "@/lib/auth";
import { carregarEdicoes } from "@/lib/edicoes-tabela";

export const dynamic = "force-dynamic";

export default async function OrgaosPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const atual = await getUsuarioAtual();
  if (!atual?.admin) {
    return <AcessoRestrito mensagem="Somente administradores podem gerenciar órgãos." />;
  }
  const [{ aba }, edicoes] = await Promise.all([searchParams, carregarEdicoes(atual.id, "admin:orgaos:")]);
  return <OrgaosAdmin abaInicial={aba === "responsaveis" ? "responsaveis" : "orgaos"} edicoes={edicoes} />;
}
