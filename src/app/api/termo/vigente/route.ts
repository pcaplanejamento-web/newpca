import { getAcessoConta } from "@/lib/acesso-conta";
import { ok } from "@/lib/http";
import { termoVigente } from "@/lib/termo-uso";

export const dynamic = "force-dynamic";

/** O Termo de Uso EM VIGOR para o cadastro (público: o texto é o mesmo para todos). `exigido` = a implantação está ATIVA. */
export async function GET() {
  const [cfg, t] = await Promise.all([getAcessoConta(), termoVigente()]);
  if (cfg.modo !== "ativo" || !t?.textoFinal || !t.hash) return ok({ exigido: false, termo: null });
  return ok({ exigido: true, termo: { versao: t.versao, hash: t.hash, texto: t.textoFinal, publicadoEm: t.publicadoEm } });
}
