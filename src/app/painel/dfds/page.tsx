import { DfdsView } from "@/components/DfdsView";
import { getUsuarioAtual } from "@/lib/auth";
import { listarDfds } from "@/lib/dfd";
import { getReparticaoContexto, getReparticaoFiltro } from "@/lib/grupos";
import { listarProtocolos } from "@/lib/protocolo";
import { RESPONSAVEIS_VAZIO } from "@/lib/reparticao-responsaveis";
import { responsaveisPorReparticao } from "@/lib/reparticoes";

export const dynamic = "force-dynamic";

export default async function DfdsPage() {
  const u = await getUsuarioAtual();
  // Head em "Geral" (rep=null) mostra tudo; senão só o da repartição ativa.
  const rep = await getReparticaoFiltro(u);
  const [dfds, protocolos, repCtx] = await Promise.all([
    listarDfds(rep?.id),
    listarProtocolos(rep?.id),
    getReparticaoContexto(u),
  ]);
  const podeEditar = u?.role === "admin" || u?.role === "gestor";

  // Enriquece as repartições com os RESPONSÁVEIS por DFDs (para conferir a assinatura
  // nos banners); a lista base traz só {id,codigo,nome}.
  const respMap = await responsaveisPorReparticao(repCtx.lista.map((r) => r.id));
  const reparticoes = repCtx.lista.map((r) => ({ ...r, responsaveis: respMap[r.id] ?? RESPONSAVEIS_VAZIO }));

  return (
    <DfdsView
      podeEditar={podeEditar}
      dfds={dfds}
      protocolos={protocolos}
      reparticoes={reparticoes}
      reparticaoAtivaId={repCtx.ativa?.id ?? null}
    />
  );
}
