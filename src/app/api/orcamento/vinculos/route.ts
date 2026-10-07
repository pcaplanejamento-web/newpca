import { exigirAcesso } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { escopoDoVinculo, gravarVinculosOrcamento, vinculosGravados } from "@/lib/orcamento";
import { criarVinculosOrcamentoSchema } from "@/lib/orcamento-validation";
import { textoEscopo } from "@/lib/orcamento-vinculo";

export const dynamic = "force-dynamic";

/**
 * CRIA vínculos da UNIDADE do orçamento (texto do CUBO) com unidades do cadastro (Configurar no Orçamento) — cada um
 * com as suas AÇÕES (lista explícita ou as DEMAIS). Uma unidade do CUBO pode ter vários; a regra (`conflitoVinculo`) e a
 * unidade cadastrada são conferidas no servidor. O `escopo` diz onde gravar: o PADRÃO (o de sempre) e/ou as visões.
 */
export async function POST(req: Request) {
  const a = await exigirAcesso("orcamento", "configurar");
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(criarVinculosOrcamentoSchema, req);
  if ("resp" in p) return p.resp;
  const escopo = p.data.escopo ?? escopoDoVinculo(null);
  const falha = await gravarVinculosOrcamento(
    p.data.vinculos.map(({ texto, ...para }) => ({ texto, de: null, para })),
    escopo,
  );
  if (falha) return erro(falha, 422);
  const n = p.data.vinculos.length;
  await registrarAuditoria({
    usuario: a.u,
    acao: "criar",
    entidade: "orcamento",
    entidadeId: null,
    resumo: `${n} ${n === 1 ? "vínculo criado" : "vínculos criados"} entre unidades do orçamento e do cadastro (${textoEscopo(escopo)})`,
    depois: { vinculos: p.data.vinculos, escopo },
  });
  // A lista GRAVADA volta na resposta — a tela fica igual ao banco sem esperar a recarga.
  return ok(await vinculosGravados());
}
