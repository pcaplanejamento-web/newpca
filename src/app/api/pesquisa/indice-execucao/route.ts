import { podeTela } from "@/lib/acesso";
import { exigirSessao } from "@/lib/api-auth";
import { indiceExecucao } from "@/lib/pesquisa";
import { TIPOS_EXECUCAO_PESQUISA, VALIDADE_INDICE_EXECUCAO_MS } from "@/lib/pesquisa-core";

export const dynamic = "force-dynamic";

const TELA = { empenho: "empenhos", liquidacao: "liquidacoes", pagamento: "pagamentos" } as const;

/**
 * O ÍNDICE DE TEXTO da execução para a pesquisa SEM prefixo: empenhos, liquidações e pagamentos que a pessoa vê (cada tipo
 * só com a tela dele, no escopo de unidades dela), em tuplas compactas. O navegador o pede só quando procura texto e o
 * guarda na memória da aba por `VALIDADE_INDICE_EXECUCAO_MS`. O texto JSON do banco vai direto na resposta (sem reler).
 */
export async function GET() {
  const a = await exigirSessao();
  if ("erro" in a) return a.erro;
  const acao = "visualizar" as const;
  const partes: string[] = [];
  for (const tipo of TIPOS_EXECUCAO_PESQUISA) {
    // Cada tipo só com a PRÓPRIA tela (a mesma régua do `tipoPermitido` — `indiceExecucao` confere de novo).
    if (!podeTela(a.acesso, TELA[tipo])[acao]) continue;
    const r = await indiceExecucao(a.acesso, tipo);
    if (r) partes.push(`{"tipo":${JSON.stringify(tipo)},"completo":${r.completo},"tuplas":${r.texto}}`);
  }
  return new Response(`{"ok":true,"validade":${VALIDADE_INDICE_EXECUCAO_MS},"grupos":[${partes.join(",")}]}`, {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}
