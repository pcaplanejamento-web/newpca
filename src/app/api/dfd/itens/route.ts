import { exigirUsuario } from "@/lib/api-auth";
import { listarItensDfds } from "@/lib/dfd";
import { getReparticaoContexto, getReparticaoFiltro } from "@/lib/grupos";
import { ok } from "@/lib/http";
import { acessivelNaLista } from "@/lib/mesa-dados";

export const dynamic = "force-dynamic";

// Lista PLANA dos itens dos DFDs em escopo (visão "Itens" da Mesa), carregada SOB DEMANDA pelo cliente ao
// abrir a visão. Mesa principal: escopada pela unidade ativa (Geral ⇒ todos), sem os DFDs de protocolos
// enviados a um PCA. `?pca=ID` = a Mesa daquele PCA: as unidades ACESSÍVEIS ao usuário (não só a ativa).
export async function GET(req: Request) {
  const g = await exigirUsuario();
  if ("erro" in g) return g.erro;
  const pca = Number(new URL(req.url).searchParams.get("pca"));
  if (Number.isInteger(pca) && pca > 0) {
    const { lista } = await getReparticaoContexto(g.u);
    const acessivel = acessivelNaLista(lista);
    return ok({ itens: (await listarItensDfds(undefined, pca)).filter((it) => acessivel(it.reparticaoId)) });
  }
  const rep = await getReparticaoFiltro(g.u);
  return ok({ itens: await listarItensDfds(rep?.id) });
}
