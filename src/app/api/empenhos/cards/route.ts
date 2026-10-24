import { exigirAcesso } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { CARD_PADRAO } from "@/lib/empenho-cards-core";
import { criarCard, getCard } from "@/lib/empenho-cards";
import { criarCardSchema } from "@/lib/empenho-cards-validation";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/** CRIA um card de empenhos (Configurar): o nome e, opcional, os vínculos copiados de outro card; o resto no padrão. */
export async function POST(req: Request) {
  const g = await exigirAcesso("empenhos", "configurar");
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(criarCardSchema, req);
  if ("resp" in p) return p.resp;
  const copiarDe = p.data.copiarDe ?? null;
  const origem = copiarDe == null ? null : await getCard(copiarDe);
  if (copiarDe != null && !origem) return erro("O card de onde copiar os vínculos não existe mais.", 404);
  const id = await criarCard({ ...CARD_PADRAO, nome: p.data.nome }, copiarDe, g.u.nome);
  await registrarAuditoria({
    usuario: g.u,
    acao: "criar",
    entidade: "empenho_card",
    entidadeId: id,
    resumo: `Card de empenhos "${p.data.nome}" criado${origem ? ` com os vínculos de "${origem.nome}"` : ""}`,
  });
  return ok({ id });
}
