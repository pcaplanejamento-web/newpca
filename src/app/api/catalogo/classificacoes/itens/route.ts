import { exigirUsuario } from "@/lib/api-auth";
import { getReparticaoFiltro } from "@/lib/grupos";
import { ok } from "@/lib/http";
import { descricoesDosItens } from "@/lib/padronizacao";

export const dynamic = "force-dynamic";

/**
 * As DESCRIÇÕES DISTINTAS dos itens (DFDs no escopo da unidade ativa — "Geral" = todos — e o catálogo), com quantos
 * itens as usam e o valor dos de DFD: a base da PRÉVIA da classificação automática (classificada no navegador, ao vivo
 * enquanto o cadastro é editado). Carregada sob demanda, uma vez por abertura da tela.
 */
export async function GET() {
  const g = await exigirUsuario();
  if ("erro" in g) return g.erro;
  const rep = await getReparticaoFiltro(g.u);
  return ok({ descricoes: await descricoesDosItens(rep?.id) });
}
