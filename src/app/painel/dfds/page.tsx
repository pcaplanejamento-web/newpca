import { DfdsView } from "@/components/DfdsView";
import { getUsuarioAtual } from "@/lib/auth";
import { listarDfds } from "@/lib/dfd";
import { getReparticaoContexto, getReparticaoFiltro } from "@/lib/grupos";

export const dynamic = "force-dynamic";

export default async function DfdsPage() {
  const u = await getUsuarioAtual();
  // Head em "Geral" (rep=null) mostra tudo; senão só o da repartição ativa.
  const rep = await getReparticaoFiltro(u);
  const [dfds, repCtx] = await Promise.all([listarDfds(rep?.id), getReparticaoContexto(u)]);
  const podeEditar = u?.role === "admin" || u?.role === "gestor";

  return (
    <DfdsView
      podeEditar={podeEditar}
      dfds={dfds}
      reparticoes={repCtx.lista}
      reparticaoAtivaId={repCtx.ativa?.id ?? null}
    />
  );
}
