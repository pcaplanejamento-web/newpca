import { escopoMesa } from "@/lib/acesso-mesa";
import { exigirSessao, recusa } from "@/lib/api-auth";
import { conformidadeDosItens } from "@/lib/catalogo";
import { referenciasHistorico } from "@/lib/catalogo-historico";
import { type ItemDfdRow, listarItensDfds } from "@/lib/dfd";
import { getConfigEscopo } from "@/lib/escopo-cabecalho";
import { filtroDoModulo } from "@/lib/escopo-cabecalho-core";
import { idDoFiltro } from "@/lib/escopo-unidades-core";
import { erro, ok } from "@/lib/http";
import { redigirItens } from "@/lib/mesa-redacao";
import { anoMarcadosDoPca } from "@/lib/pca-espaco";
import { listarPadronizacao } from "@/lib/padronizacao";
import { normalizarCodigo } from "@/lib/parse-catalogo-comum";

export const dynamic = "force-dynamic";

type Enriquecido = {
  catalogo: Map<number, Awaited<ReturnType<typeof conformidadeDosItens>>[number]>;
  padronizacao: Awaited<ReturnType<typeof listarPadronizacao>> | null;
  historico: Awaited<ReturnType<typeof referenciasHistorico>>;
};
// DADOS PRONTOS: a lista BASE vem do `memoPorVersao` (a MESMA referência enquanto a versão não muda) — o enriquecimento
// (catálogo, padronização, histórico) é calculado UMA vez por lista e reusado; dado novo = lista nova = recalcula.
const enriquecidos = new WeakMap<ItemDfdRow[], Promise<Enriquecido>>();
function enriquecer(base: ItemDfdRow[]): Promise<Enriquecido> {
  const pronto = enriquecidos.get(base);
  if (pronto) return pronto;
  // Auxiliares: uma falha na conferência do catálogo, no cadastro da padronização ou no histórico de compra nunca derruba
  // a lista (a coluna fica "—"; as da padronização e a do histórico só não aparecem).
  const p = Promise.all([
    conformidadeDosItens(base).catch(() => base.map(() => null)),
    listarPadronizacao().catch((e) => {
      console.error("[itens] padronização indisponível:", e);
      return null;
    }),
    referenciasHistorico(base.map((it) => normalizarCodigo(it.codigo))).catch((e) => {
      console.error("[itens] histórico de compra indisponível:", e);
      return {};
    }),
  ]).then(([cat, padronizacao, historico]) => ({ catalogo: new Map(base.map((it, i) => [it.id, cat[i]])), padronizacao, historico }));
  enriquecidos.set(base, p);
  p.catch(() => enriquecidos.delete(base));
  return p;
}

// Lista PLANA dos itens dos DFDs em escopo (visão "Itens" da Mesa), carregada SOB DEMANDA pelo cliente ao
// abrir a visão. Mesa principal: escopada pela unidade ativa (Geral ⇒ todos) e pelo PCA do CABEÇALHO — `?ano=AAAA`, o
// ano com que a PÁGINA foi carregada (os itens casam com os protocolos/DFDs dela, mesmo que o PCA troque noutra aba;
// ausente = todos os PCAs) —, sem os DFDs de protocolos enviados a um PCA. `?pca=ID` = a Mesa daquele PCA: as unidades
// ACESSÍVEIS ao usuário (não só a ativa) — com a visão dos MARCADOS do PCA, também os do ano dele na Mesa do sistema.
// Cada item vem com a CONFORMIDADE com o catálogo (veredito compacto — a coluna "Catálogo"), numa consulta só, e a
// resposta traz o cadastro da PADRONIZAÇÃO (Catálogo → Unidades de medida | Classificações): as colunas "Classificação" e
// "Unid. cadastrada" — e a REFERÊNCIA do HISTÓRICO DE COMPRA de cada código (o valor atual + médio/menor/maior entre
// contratos — a coluna "Histórico", que aponta o item com valor divergente), carregados só com a visão Itens aberta.
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
  let base: ItemDfdRow[] = [];
  const esc = await escopoMesa();
  if (!esc) return erro("Faça login.", 401);
  const un = esc.un;
  if (doPca) {
    // Com a visão dos MARCADOS ligada no PCA (o servidor decide), também os itens do ano dele ainda na Mesa do sistema.
    // E, com o PCA obedecendo ao cabeçalho (Configurações → Filtro da unidade), só os da unidade ativa.
    const rep = filtroDoModulo(await getConfigEscopo(), "pca", idDoFiltro(un.filtro));
    if (rep !== false) base = await listarItensDfds(undefined, pca, null, await anoMarcadosDoPca(pca));
    itens = base.filter((it) => un.acessivel(it.reparticaoId) && (rep == null || it.reparticaoId === rep));
  } else {
    const ano = Number(params.get("ano"));
    // A unidade ATIVA (a "Geral" = todas; sem grupo/unidade = nada).
    const repId = idDoFiltro(un.filtro);
    if (repId !== false) base = await listarItensDfds(repId ?? undefined, undefined, Number.isInteger(ano) && ano >= 2000 && ano <= 2100 ? ano : null);
    itens = base;
  }
  // As LINHAS da pessoa ("só os meus", detalhe do papel): só os itens dos DFDs dela.
  itens = redigirItens(itens, esc.meus);
  const { catalogo, padronizacao, historico } = await enriquecer(base);
  return ok({ itens: itens.map((it) => ({ ...it, catalogo: catalogo.get(it.id) ?? null })), padronizacao, historico });
}
