import { escopoMesa } from "@/lib/acesso-mesa";
import { exigirAcesso } from "@/lib/api-auth";
import { erro, ok, parseCorpo } from "@/lib/http";
import { camposDaMesa } from "@/lib/mesa-campos";
import { camposMesaSchema } from "@/lib/mesa-campos-validation";

export const dynamic = "force-dynamic";

/**
 * Os campos EXTRAS das colunas da Mesa (o seletor de colunas liga uma coluna que a lista não traz): só das linhas à vista,
 * só dos protocolos/DFDs que a pessoa LÊ e só os campos que o papel recebe (`camposDaMesa`).
 */
export async function POST(req: Request) {
  const a = await exigirAcesso(["dfd", "pca"], "visualizar");
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(camposMesaSchema, req);
  if ("resp" in p) return p.resp;
  const esc = await escopoMesa();
  if (!esc) return erro("Faça login.", 401);
  return ok(await camposDaMesa(esc, p.data.entidade, [...new Set(p.data.ids)], p.data.campos));
}
