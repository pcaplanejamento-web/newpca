import { DfdsView } from "@/components/DfdsView";
import { getUsuarioAtual } from "@/lib/auth";
import { carregarMesa } from "@/lib/mesa-dados";
import { lerVinculo } from "@/lib/tarefas-core";

export const dynamic = "force-dynamic";

// Tela "Mesa" (ex-"DFD"): mesa de trabalho única — Protocolos, DFDs e Itens vistos e abertos
// pelos mesmos banners padrão. Rota /painel/mesa (a antiga /painel/dfds redireciona). O carregamento
// é o MESMO da aba Mesa do PCA (`carregarMesa`). `?abrir=protocolo:<id>|dfd:<id>` abre o banner direto (o link do
// vínculo de uma tarefa); o acesso é conferido pela rota do banner, como no clique.
export default async function MesaPage({ searchParams }: { searchParams: Promise<{ abrir?: string }> }) {
  const [m, sp] = await Promise.all([getUsuarioAtual().then(carregarMesa), searchParams]);
  const alvo = lerVinculo(sp.abrir);
  const abrirInicial = alvo?.tipo === "protocolo" || alvo?.tipo === "dfd" ? { tipo: alvo.tipo, id: alvo.id } : null;
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
      usuarioId={m.usuarioId}
      filtroInicial={m.filtroInicial}
      pcaFiltro={m.pcaFiltro}
      edicoes={m.edicoes}
      abrirInicial={abrirInicial}
    />
  );
}
