import { NextResponse } from "next/server";
import { intId } from "@/lib/api-auth";
import { erro, parseCorpo } from "@/lib/http";
import { dadosDoDocumento, getConfigDocumento, registrarEmissao } from "@/lib/pca-documento";
import { urlVerificacaoDocumento } from "@/lib/pca-documento-core";
import { emitirDocumentoSchema } from "@/lib/pca-documento-validation";
import { getPcaEspaco } from "@/lib/pca-espaco";
import { contarTentativa, ipDe, respostaLimite, verificarCaptcha } from "@/lib/seguranca-acesso";

export const dynamic = "force-dynamic";

/**
 * EMISSÃO PÚBLICA do DOCUMENTO OFICIAL do PCA (qualquer visitante da tela inicial). Travas, nesta ordem: o próprio site
 * (`parseCorpo` — origem), o PCA PUBLICADO com o documento LIGADO pelo ADM, o LIMITE por IP (fecha na falha do banco), a
 * verificação ANTI-ROBÔ (vale uma vez) e algum item. Registra a emissão (código de verificação + selo SHA-256 dos números,
 * dos dados e da configuração; o IP só como hash) e devolve a configuração e os dados — o PDF é montado no navegador.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const pcaId = intId((await ctx.params).id);
  if (!pcaId) return erro("ID inválido.");
  const p = await parseCorpo(emitirDocumentoSchema, req);
  if ("resp" in p) return p.resp;
  const pca = await getPcaEspaco(pcaId);
  const cfg = pca?.status === "publicado" ? await getConfigDocumento(pcaId) : null;
  if (!pca || !cfg?.ativo) return erro("O documento deste PCA não está disponível.", 404);
  const ip = ipDe(req);
  const espera = await contarTentativa("emitirDocumentoPcaIp", ip, true);
  if (espera) return respostaLimite(espera);
  const captcha = await verificarCaptcha(req, p.data.token);
  if (!captcha.ok) return erro(captcha.motivo, 403);
  const dados = await dadosDoDocumento(pca);
  if (!dados.totais.itens) return erro("O PCA ainda não tem itens publicados.", 409);
  const e = await registrarEmissao(pca, cfg, dados, ip);
  return NextResponse.json(
    {
      ok: true,
      emissao: { ...e, url: urlVerificacaoDocumento(new URL(req.url).origin, e.codigo) },
      config: cfg,
      pca: { id: pca.id, nome: pca.nome, ano: pca.ano },
      dados: { itensTexto: dados.itensTexto, dfds: dados.dfds, unidades: dados.unidades },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
