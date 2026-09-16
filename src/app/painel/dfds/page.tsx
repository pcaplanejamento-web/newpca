import { DfdsView } from "@/components/DfdsView";
import { getRegrasAvaliacao } from "@/lib/avaliacao";
import { getUsuarioAtual } from "@/lib/auth";
import { listarDfds, listarPcas } from "@/lib/dfd";
import { getReparticaoContexto, getReparticaoFiltro } from "@/lib/grupos";
import { listarOrgaos } from "@/lib/orgaos";
import { listarProtocolos } from "@/lib/protocolo";
import { RESPONSAVEIS_VAZIO } from "@/lib/reparticao-responsaveis";
import { dadosMatchPorReparticao, responsaveisPorReparticao } from "@/lib/reparticoes";

export const dynamic = "force-dynamic";

export default async function DfdsPage() {
  const u = await getUsuarioAtual();
  // Head em "Geral" (rep=null) mostra tudo; senão só o da repartição ativa.
  const rep = await getReparticaoFiltro(u);
  const [dfds, protocolos, repCtx, pcas, regras, orgaos] = await Promise.all([
    listarDfds(rep?.id),
    listarProtocolos(rep?.id),
    getReparticaoContexto(u),
    listarPcas(),
    getRegrasAvaliacao(),
    listarOrgaos(),
  ]);
  const podeEditar = u?.role === "admin" || u?.role === "gestor";

  // Enriquece as unidades com os RESPONSÁVEIS por DFDs (conferência da assinatura) e os
  // campos de MATCH (interessado/setor/órgão) — a lista base traz só {id,codigo,nome}.
  const ids = repCtx.lista.map((r) => r.id);
  const [respMap, matchMap] = await Promise.all([responsaveisPorReparticao(ids), dadosMatchPorReparticao(ids)]);
  const reparticoes = repCtx.lista.map((r) => ({
    ...r,
    responsaveis: respMap[r.id] ?? RESPONSAVEIS_VAZIO,
    numeroInteressado: matchMap[r.id]?.numeroInteressado ?? null,
    setorRequisitante: matchMap[r.id]?.setorRequisitante ?? null,
    orgaoId: matchMap[r.id]?.orgaoId ?? null,
  }));

  return (
    <DfdsView
      podeEditar={podeEditar}
      dfds={dfds}
      protocolos={protocolos}
      reparticoes={reparticoes}
      reparticaoAtivaId={repCtx.ativa?.id ?? null}
      pcas={pcas}
      regras={regras}
      orgaos={orgaos}
    />
  );
}
