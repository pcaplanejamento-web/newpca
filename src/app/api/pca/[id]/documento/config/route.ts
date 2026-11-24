import { NextResponse } from "next/server";
import { exigirAcesso, intId, recusaPca } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { dadosDoDocumento, getConfigDocumento, gravarConfigDocumento, listarEmissoes } from "@/lib/pca-documento";
import { configDocumentoSchema } from "@/lib/pca-documento-validation";
import { getPcaEspaco } from "@/lib/pca-espaco";
import { podeDocumentoOficial } from "@/lib/papeis-detalhes-core";

const MSG_SEM_HABILITACAO = "Seu papel não tem a habilitação para o documento oficial do PCA — peça ao administrador.";

export const dynamic = "force-dynamic";

/**
 * O DOCUMENTO OFICIAL de UM PCA (cada PCA tem o seu) — quem tem a tela PCA, o PCA no grupo E a habilitação do papel
 * (Detalhes → PCA → "Configurar o documento oficial"; o ADM sempre): GET = a configuração + as emissões (`?dados=1` = também
 * os dados, para a PRÉVIA, sem registrar emissão); PUT = grava a configuração (auditoria).
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirAcesso("pca", "visualizar");
  if ("erro" in g) return g.erro;
  if (!podeDocumentoOficial(g.u)) return erro(MSG_SEM_HABILITACAO, 403);
  const pcaId = intId((await ctx.params).id);
  const pca = pcaId ? await getPcaEspaco(pcaId) : null;
  if (!pca) return erro("PCA não encontrado.", 404);
  const semPca = await recusaPca(pca.id);
  if (semPca) return semPca;
  if (new URL(req.url).searchParams.get("dados") === "1") {
    const d = await dadosDoDocumento(pca);
    return NextResponse.json(
      { ok: true, pca: { id: pca.id, nome: pca.nome, ano: pca.ano }, dados: { itensTexto: d.itensTexto, dfds: d.dfds, unidades: d.unidades } },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  const [config, emissoes] = await Promise.all([getConfigDocumento(pca.id), listarEmissoes(pca.id)]);
  return ok({ config, emissoes: emissoes.lista, totalEmissoes: emissoes.total, publicado: pca.status === "publicado" });
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirAcesso("pca", "visualizar");
  if ("erro" in g) return g.erro;
  if (!podeDocumentoOficial(g.u)) return erro(MSG_SEM_HABILITACAO, 403);
  const pcaId = intId((await ctx.params).id);
  const pca = pcaId ? await getPcaEspaco(pcaId) : null;
  if (!pca) return erro("PCA não encontrado.", 404);
  const semPca = await recusaPca(pca.id);
  if (semPca) return semPca;
  const p = await parseCorpo(configDocumentoSchema, req);
  if ("resp" in p) return p.resp;
  const antes = await getConfigDocumento(pca.id);
  const config = await gravarConfigDocumento(pca.id, p.data, g.u.nome);
  const mudouAtivo = antes.ativo !== config.ativo;
  await registrarAuditoria({
    usuario: g.u,
    acao: "editar",
    entidade: "pca",
    entidadeId: pca.id,
    resumo: `Documento do PCA ${pca.nome}: configuração salva${mudouAtivo ? ` — emissão pública ${config.ativo ? "LIGADA" : "DESLIGADA"}` : ""}`,
  });
  return ok({ config });
}
