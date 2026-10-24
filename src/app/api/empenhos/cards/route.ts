import { exigirAcesso } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { cardPadrao } from "@/lib/empenho-cards-core";
import { criarCard, getCard } from "@/lib/empenho-cards";
import { criarCardSchema } from "@/lib/empenho-cards-validation";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * CRIA um card (Configurar na tela do tipo): o nome e, opcional, os vínculos (empenhos) ou os órgãos (liquidações)
 * copiados de outro card do MESMO tipo. O resto começa no padrão do tipo.
 */
export async function POST(req: Request) {
  const p = await parseCorpo(criarCardSchema, req);
  if ("resp" in p) return p.resp;
  const tipo = p.data.tipo ?? "empenhos";
  const g = await exigirAcesso(tipo === "liquidacoes" ? "liquidacoes" : "empenhos", "configurar");
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
      tipo === "liquidacoes"
        ? `Card de liquidações "${p.data.nome}" criado${origem ? ` com os órgãos de "${origem.nome}"` : ""}`
        : `Card de empenhos "${p.data.nome}" criado${origem ? ` com os vínculos de "${origem.nome}"` : ""}`,
  });
  return ok({ id });
}
