import { exigirAcesso } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { cardPadrao, NOME_TIPO } from "@/lib/empenho-cards-core";
import { criarCard, getCard } from "@/lib/empenho-cards";
import { criarCardSchema } from "@/lib/empenho-cards-validation";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * CRIA um card (Configurar na tela do tipo): o nome e, opcional (empenhos), os vínculos copiados de outro card de
 * empenhos. O resto começa no padrão do tipo.
 */
export async function POST(req: Request) {
  const p = await parseCorpo(criarCardSchema, req);
  if ("resp" in p) return p.resp;
  const tipo = p.data.tipo ?? "empenhos";
  const g = await exigirAcesso(tipo === "pagamentos" ? "pagamentos" : tipo === "liquidacoes" ? "liquidacoes" : "empenhos", "configurar");
  if ("erro" in g) return g.erro;
  const copiarDe = p.data.copiarDe ?? null;
  const origem = copiarDe == null ? null : await getCard(copiarDe);
  if (copiarDe != null && (!origem || origem.tipo !== tipo)) return erro("O card de onde copiar não existe mais.", 404);
  const id = await criarCard({ ...cardPadrao(tipo), nome: p.data.nome }, copiarDe, g.u.nome, tipo);
  await registrarAuditoria({
    usuario: g.u,
    acao: "criar",
    entidade: "empenho_card",
    entidadeId: id,
    resumo:
      tipo !== "empenhos"
        ? `Card de ${NOME_TIPO[tipo].varios} "${p.data.nome}" criado`
        : `Card de empenhos "${p.data.nome}" criado${origem ? ` com os vínculos de "${origem.nome}"` : ""}`,
  });
  return ok({ id });
}
