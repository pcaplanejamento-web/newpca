import { exigirAcesso, intId } from "@/lib/api-auth";
import { empenhoCompleto, orgaosDosEmpenhos } from "@/lib/empenhos-tela";
import { empenhoNoEscopo } from "@/lib/empenhos-tela-core";
import { erro, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Um empenho com TUDO (o histórico, a importação que o gravou, o leitor) — o banner da tela Empenhos. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await exigirAcesso("empenhos", "visualizar");
  if ("erro" in g) return g.erro;
  const id = intId((await params).id);
  if (id == null) return erro("Empenho inválido.", 422);
  const empenho = await empenhoCompleto(id);
  // Fora dos órgãos da pessoa responde como inexistente (não revela).
  if (!empenho || !empenhoNoEscopo(await orgaosDosEmpenhos(), empenho.orgaoGestor)) return erro("Empenho não encontrado.", 404);
  return ok({ empenho });
}
