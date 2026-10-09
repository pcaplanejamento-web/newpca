import { exigirAcesso } from "@/lib/api-auth";
import { comprasDosCodigos } from "@/lib/catalogo-historico";
import { historicoDasLinhas } from "@/lib/historico-compra-core";
import { erro, ok } from "@/lib/http";
import { normalizarCodigo } from "@/lib/parse-catalogo-comum";

export const dynamic = "force-dynamic";

/**
 * O HISTÓRICO DE COMPRA de UM produto (pelo código) em TODOS os históricos — itens + contratos para o banner do produto
 * (`ProdutoHistoricoDetalhe`) e a comparação com o valor do item importado (`ComparacaoHistoricoCompra`, no detalhe do
 * item). Quem vê uma das Mesas ou o Catálogo.
 */
export async function GET(req: Request) {
  const a = await exigirAcesso(["dfd", "pca", "catalogo"], "visualizar");
  if ("erro" in a) return a.erro;
  const codigo = normalizarCodigo(new URL(req.url).searchParams.get("codigo"));
  if (!codigo || codigo.length > 60) return erro("Código inválido.");
  return ok(historicoDasLinhas(await comprasDosCodigos([codigo])));
}
