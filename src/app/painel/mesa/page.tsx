import { DfdsView } from "@/components/DfdsView";
import { getUsuarioAtual } from "@/lib/auth";
import { carregarMesa } from "@/lib/mesa-dados";

export const dynamic = "force-dynamic";

// Tela "Mesa" (ex-"DFD"): mesa de trabalho única — Protocolos, DFDs e Itens vistos e abertos
// pelos mesmos banners padrão. Rota /painel/mesa (a antiga /painel/dfds redireciona). O carregamento
// é o MESMO da aba Mesa do PCA (`carregarMesa`).
export default async function MesaPage() {
  const m = await carregarMesa(await getUsuarioAtual());
  return (
    <DfdsView
      podeEditar={m.podeEditar}
      dfds={m.dfds}
      protocolos={m.protocolos}
      reparticoes={m.reparticoes}
      reparticaoAtivaId={m.reparticaoAtivaId}
      pcas={m.pcas}
      regras={m.regras}
      orgaos={m.orgaos}
      pessoas={m.pessoas}
      outrasPessoas={m.outrasPessoas}
      situacoes={m.situacoes}
      padronizacao={m.padronizacao}
      usuarioId={m.usuarioId}
      filtroInicial={m.filtroInicial}
      pcaFiltro={m.pcaFiltro}
    />
  );
}
