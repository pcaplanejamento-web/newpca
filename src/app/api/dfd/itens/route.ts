import { exigirSessao, recusa } from "@/lib/api-auth";
import { conformidadeDosItens } from "@/lib/catalogo";
import { type ItemDfdRow, listarItensDfds } from "@/lib/dfd";
import { idDoFiltro } from "@/lib/escopo-unidades-core";
import { unidadesDaSessao } from "@/lib/grupos";
import { ok } from "@/lib/http";
import { anoMarcadosDoPca } from "@/lib/pca-espaco";
import { listarPadronizacao } from "@/lib/padronizacao";

export const dynamic = "force-dynamic";

// Lista PLANA dos itens dos DFDs em escopo (visão "Itens" da Mesa), carregada SOB DEMANDA pelo cliente ao
// abrir a visão. Mesa principal: escopada pela unidade ativa (Geral ⇒ todos) e pelo PCA do CABEÇALHO — `?ano=AAAA`, o
// ano com que a PÁGINA foi carregada (os itens casam com os protocolos/DFDs dela, mesmo que o PCA troque noutra aba;
// ausente = todos os PCAs) —, sem os DFDs de protocolos enviados a um PCA. `?pca=ID` = a Mesa daquele PCA: as unidades
// ACESSÍVEIS ao usuário (não só a ativa) — com a visão dos MARCADOS do PCA, também os do ano dele na Mesa do sistema.
// Cada item vem com a CONFORMIDADE com o catálogo (veredito compacto — a coluna "Catálogo"), numa consulta só, e a
// resposta traz o cadastro da PADRONIZAÇÃO (Catálogo → Unidades de medida | Classificações): as colunas "Classificação" e
// "Unid. cadastrada" — carregado só com a visão Itens aberta.
export async function GET(req: Request) {
  const g = await exigirSessao();
  if ("erro" in g) return g.erro;
  const params = new URL(req.url).searchParams;
  const pca = Number(params.get("pca"));
  const doPca = Number.isInteger(pca) && pca > 0;
  // A Mesa do PCA exige VISUALIZAR o PCA; a do sistema, a Mesa.
  const negado = recusa(g.acesso, doPca ? "pca" : "dfd", "visualizar");
  if (negado) return negado;
  let itens: ItemDfdRow[];
  const un = await unidadesDaSessao(g.u);
  if (doPca) {
    // Com a visão dos MARCADOS ligada no PCA (o servidor decide), também os itens do ano dele ainda na Mesa do sistema.
    itens = (await listarItensDfds(undefined, pca, null, await anoMarcadosDoPca(pca))).filter((it) => un.acessivel(it.reparticaoId));
  } else {
    const ano = Number(params.get("ano"));
    // A unidade ATIVA (a "Geral" = todas; sem grupo/unidade = nada).
    const repId = idDoFiltro(un.filtro);
    itens = repId === false ? [] : await listarItensDfds(repId ?? undefined, undefined, Number.isInteger(ano) && ano >= 2000 && ano <= 2100 ? ano : null);
  }
  // Auxiliares: uma falha na conferência do catálogo ou no cadastro da padronização nunca derruba a lista (a coluna fica
  // "—"; as da padronização só não aparecem).
  const [catalogo, padronizacao] = await Promise.all([
    conformidadeDosItens(itens).catch(() => itens.map(() => null)),
    listarPadronizacao().catch((e) => {
      console.error("[itens] padronização indisponível:", e);
      return null;
    }),
  ]);
  return ok({ itens: itens.map((it, i) => ({ ...it, catalogo: catalogo[i] })), padronizacao });
}
