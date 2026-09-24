import { exigirUsuario } from "@/lib/api-auth";
import { conformidadeDosItens } from "@/lib/catalogo";
import { type ItemDfdRow, listarItensDfds } from "@/lib/dfd";
import { getReparticaoContexto, getReparticaoFiltro } from "@/lib/grupos";
import { ok } from "@/lib/http";
import { acessivelNaLista } from "@/lib/mesa-dados";

export const dynamic = "force-dynamic";

// Lista PLANA dos itens dos DFDs em escopo (visão "Itens" da Mesa), carregada SOB DEMANDA pelo cliente ao
// abrir a visão. Mesa principal: escopada pela unidade ativa (Geral ⇒ todos) e pelo PCA do CABEÇALHO — `?ano=AAAA`, o
// ano com que a PÁGINA foi carregada (os itens casam com os protocolos/DFDs dela, mesmo que o PCA troque noutra aba;
// ausente = todos os PCAs) —, sem os DFDs de protocolos enviados a um PCA. `?pca=ID` = a Mesa daquele PCA: as unidades
// ACESSÍVEIS ao usuário (não só a ativa).
// Cada item vem com a CONFORMIDADE com o catálogo (veredito compacto — a coluna "Catálogo"), numa consulta só.
export async function GET(req: Request) {
  const g = await exigirUsuario();
  if ("erro" in g) return g.erro;
  const params = new URL(req.url).searchParams;
  const pca = Number(params.get("pca"));
  let itens: ItemDfdRow[];
  if (Number.isInteger(pca) && pca > 0) {
    const { lista } = await getReparticaoContexto(g.u);
    const acessivel = acessivelNaLista(lista);
    itens = (await listarItensDfds(undefined, pca)).filter((it) => acessivel(it.reparticaoId));
  } else {
    const ano = Number(params.get("ano"));
    const rep = await getReparticaoFiltro(g.u);
    itens = await listarItensDfds(rep?.id, undefined, Number.isInteger(ano) && ano >= 2000 && ano <= 2100 ? ano : null);
  }
  // Auxiliar: uma falha na conferência do catálogo nunca derruba a lista (a coluna fica "—").
  const catalogo = await conformidadeDosItens(itens).catch(() => itens.map(() => null));
  return ok({ itens: itens.map((it, i) => ({ ...it, catalogo: catalogo[i] })) });
}
