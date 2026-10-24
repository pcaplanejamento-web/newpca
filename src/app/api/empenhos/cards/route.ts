import { exigirAcesso } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { cardPadrao } from "@/lib/empenho-cards-core";
import { criarCard, getCard } from "@/lib/empenho-cards";
import { criarCardSchema } from "@/lib/empenho-cards-validation";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * CRIA um card (Configurar na tela do tipo): de EMPENHOS — o nome e, opcional, os vínculos copiados de outro card — ou de
 * LIQUIDAÇÕES — o nome e o card de empenhos de ORIGEM. O resto começa no padrão do tipo.
 */
export async function POST(req: Request) {
  const p = await parseCorpo(criarCardSchema, req);
  if ("resp" in p) return p.resp;
  const tipo = p.data.tipo ?? "empenhos";
  const g = await exigirAcesso(tipo === "liquidacoes" ? "liquidacoes" : "empenhos", "configurar");
  if ("erro" in g) return g.erro;
  const ref = tipo === "liquidacoes" ? (p.data.origemId ?? null) : (p.data.copiarDe ?? null);
  const origem = ref == null ? null : await getCard(ref);
  if (ref != null && (!origem || origem.tipo !== "empenhos")) return erro(tipo === "liquidacoes" ? "O card de empenhos de origem não existe mais." : "O card de onde copiar os vínculos não existe mais.", 404);
  const id = await criarCard({ ...cardPadrao(tipo, tipo === "liquidacoes" ? ref : null), nome: p.data.nome }, tipo === "empenhos" ? ref : null, g.u.nome, tipo);
  await registrarAuditoria({
    usuario: g.u,
    acao: "criar",
    entidade: "empenho_card",
    entidadeId: id,
    resumo:
      tipo === "liquidacoes"
        ? `Card de liquidações "${p.data.nome}" criado${origem ? ` com os empenhos de "${origem.nome}"` : ""}`
        : `Card de empenhos "${p.data.nome}" criado${origem ? ` com os vínculos de "${origem.nome}"` : ""}`,
  });
  return ok({ id });
}
