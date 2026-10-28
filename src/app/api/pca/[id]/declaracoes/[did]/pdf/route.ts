import { podeTela } from "@/lib/acesso";
import { exigirAcesso } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { pdfDaDeclaracao } from "@/lib/declaracao-pdf";
import { contextoDeclaracoes, declaracaoDoContexto, exportarDeclaracao, getDeclaracao } from "@/lib/declaracoes";
import { erro } from "@/lib/http";
import { origemPermitida } from "@/lib/origem";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; did: string }> };

const resposta = (bytes: Uint8Array, nome: string, baixar: boolean) =>
  new Response(bytes as Uint8Array<ArrayBuffer>, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${baixar ? "attachment" : "inline"}; filename="${nome}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });

/**
 * O PDF da declaração (gerado no servidor do retrato): ver = quem visualiza — a ainda NÃO exportada sai como PRÉVIA
 * (marcada, sem validade); `?baixar=1` = baixar de novo a JÁ exportada (quem exporta no PCA).
 */
export async function GET(req: Request, ctx: Ctx) {
  const baixar = new URL(req.url).searchParams.get("baixar") === "1";
  const g = await exigirAcesso("pca", "visualizar");
  if ("erro" in g) return g.erro;
  if (baixar && !podeTela(g.acesso, "pca").exportar) return erro("Sem permissão para baixar.", 403);
  const { id, did } = await ctx.params;
  const c = await contextoDeclaracoes(g, id, baixar ? "exportar" : "visualizar");
  if ("erro" in c) return c.erro;
  const d = (await declaracaoDoContexto(c.pca, c.rep, did))?.d;
  if (!d) return erro("Declaração não encontrada.", 404);
  if (baixar && !d.exportada && !d.cancelada) return erro("Exporte a declaração primeiro — a exportação trava a edição.", 409);
  const bytes = await pdfDaDeclaracao(d, new URL(req.url).origin);
  if (!bytes) return erro("Declaração não encontrada.", 404);
  return resposta(bytes, `declaracao-${d.numero}-${d.ano}${d.exportada || d.cancelada ? "" : "-previa"}.pdf`, baixar);
}

/**
 * EXPORTA o PDF: marca a declaração como exportada (daí em diante não se edita mais) e devolve o PDF final para baixar —
 * quem EXPORTA no PCA. A já exportada só é baixada de novo.
 */
export async function POST(req: Request, ctx: Ctx) {
  if (!origemPermitida(req)) return erro("Origem não permitida.", 403);
  const g = await exigirAcesso("pca", "exportar");
  if ("erro" in g) return g.erro;
  const { id, did } = await ctx.params;
  const c = await contextoDeclaracoes(g, id, "exportar");
  if ("erro" in c) return c.erro;
  const v = await declaracaoDoContexto(c.pca, c.rep, did);
  if (!v) return erro("Declaração não encontrada.", 404);
  if (v.d.cancelada) return erro("A declaração está cancelada.", 409);
  if (await exportarDeclaracao(v.d.id, g.u.nome))
    await registrarAuditoria({ usuario: g.u, acao: "editar", entidade: "declaracao", entidadeId: v.d.id, resumo: `Declaração ${v.d.rotulo} EXPORTADA em PDF — não pode mais ser editada` });
  const d = await getDeclaracao(v.d.id);
  const bytes = d ? await pdfDaDeclaracao(d, new URL(req.url).origin) : null;
  if (!d || !bytes) return erro("Declaração não encontrada.", 404);
  return resposta(bytes, `declaracao-${d.numero}-${d.ano}.pdf`, true);
}
