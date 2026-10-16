import { exigirAcesso, intId, recusaPca } from "@/lib/api-auth";
import { erro, ok } from "@/lib/http";
import { getPcaEspaco, relatorioOrcamentoDoPca } from "@/lib/pca-espaco";

export const dynamic = "force-dynamic";

/**
 * RELATÓRIO DA COMPOSIÇÃO do orçamento do PCA (PCA × Orçamento): o que a visão considera (igual para todas as unidades), o
 * que cada vínculo atribui a cada unidade cadastrada (unidade do CUBO + ações) e o que fica de fora. A tela monta o PDF.
 * Quem EXPORTA no PCA.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirAcesso("pca", "exportar");
  if ("erro" in a) return a.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const semPca = await recusaPca(id);
  if (semPca) return semPca;
  const pca = await getPcaEspaco(id);
  if (!pca) return erro("PCA não encontrado.", 404);
  const relatorio = await relatorioOrcamentoDoPca(pca);
  if (!relatorio) return erro("Nenhum orçamento importado para o ano deste PCA.", 404);
  return ok({ relatorio });
}
