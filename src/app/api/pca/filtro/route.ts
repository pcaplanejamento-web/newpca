import { exigirUsuario } from "@/lib/api-auth";
import { erro, ok, parseCorpo } from "@/lib/http";
import { filtroPcaSchema } from "@/lib/pca-espaco-validation";
import { definirPcaFiltro, pcasDoFiltro } from "@/lib/pca-filtro";

export const dynamic = "force-dynamic";

/** Define o PCA do CABEÇALHO (cookie) — o filtro global da Mesa, do módulo PCA e do Orçamento; `null` = todos os PCAs.
 * Só um PCA cadastrado com ano (o filtro casa pelo ano do PCA do protocolo/DFD). */
export async function POST(req: Request) {
  const g = await exigirUsuario();
  if ("erro" in g) return g.erro;
  const corpo = await parseCorpo(filtroPcaSchema, req);
  if ("resp" in corpo) return corpo.resp;
  const id = corpo.data.pcaId;
  if (id != null && !(await pcasDoFiltro()).some((p) => p.id === id)) return erro("PCA não encontrado.", 404);
  await definirPcaFiltro(id);
  return ok();
}
