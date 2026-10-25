import { exigirAcesso } from "@/lib/api-auth";
import { escopoDosEmpenhos } from "@/lib/empenhos-tela";
import { fontesDoAcesso, respostaExecucao } from "@/lib/execucao-dados";
import { erro } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * O DASHBOARD DA EXECUÇÃO: empenhos, liquidações e pagamentos dos anos pedidos (`?anos=2025,2026`; sem eles, o mais
 * recente), no escopo da pessoa (`escopoDosEmpenhos`). Cada etapa só sai para quem abre a tela dela — sem Empenhos, nada.
 * O corpo é o texto montado pelo banco, devolvido como está (o Worker não lê as dezenas de milhares de linhas).
 */
export async function GET(req: Request) {
  const g = await exigirAcesso("execucao", "visualizar");
  if ("erro" in g) return g.erro;
  const f = fontesDoAcesso(g.acesso);
  if (!f.empenhos) return erro("O dashboard da execução precisa do acesso à tela Empenhos.", 403);
  const texto = await respostaExecucao(new URL(req.url).searchParams.get("anos"), { liquidacoes: f.liquidacoes, pagamentos: f.pagamentos }, await escopoDosEmpenhos());
  if (texto == null) return erro("Os dados estão sendo atualizados agora — tente de novo em instantes.", 503);
  return new Response(texto, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
