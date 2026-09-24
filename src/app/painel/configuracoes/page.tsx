import { AcessoRestrito } from "@/components/AcessoRestrito";
import { ConfiguracoesAdmin } from "@/components/ConfiguracoesAdmin";
import { getAparencia } from "@/lib/aparencia";
import { getRegrasAvaliacao } from "@/lib/avaliacao";
import { getUsuarioAtual } from "@/lib/auth";
import { listarPcas } from "@/lib/dfd";
import { linhasTabela } from "@/lib/theme";

export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const { aba } = await searchParams;
  const u = await getUsuarioAtual();
  if (u?.role !== "admin") {
    return <AcessoRestrito mensagem="Somente administradores podem acessar as configurações." />;
  }

  const [aparencia, pcas, regras] = await Promise.all([getAparencia(), listarPcas(), getRegrasAvaliacao()]);
  return (
    <ConfiguracoesAdmin
      identidade={aparencia.identidade}
      linhasTabela={linhasTabela(aparencia)}
      pcas={pcas}
      regras={regras}
      abaInicial={aba}
    />
  );
}
