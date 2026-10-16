import { exigirAcesso } from "@/lib/api-auth";
import { unidadeDoModulo } from "@/lib/escopo-cabecalho";
import { ok } from "@/lib/http";
import { descricoesDosItens } from "@/lib/padronizacao";

export const dynamic = "force-dynamic";

/**
 * As DESCRIÇÕES DISTINTAS dos itens (DFDs no escopo da unidade ativa — "Geral" = todos — e o catálogo), com quantos
 * itens as usam e o valor dos de DFD: a base da PRÉVIA da classificação automática (classificada no navegador, ao vivo
 * enquanto o cadastro é editado). Carregada sob demanda, uma vez por abertura da tela.
 */
export async function GET() {
  const g = await exigirAcesso("catalogo", "visualizar");
  if ("erro" in g) return g.erro;
  // Os itens de DFD seguem a unidade ATIVA (a "Geral" = todas; sem grupo/unidade = só o catálogo).
  const rep = (await unidadeDoModulo("catalogo", g.u)).id;
  return ok({ descricoes: await descricoesDosItens(rep ?? undefined) });
}
