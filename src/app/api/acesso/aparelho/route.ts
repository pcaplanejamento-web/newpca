import { exigirUsuarioLivre } from "@/lib/api-auth";
import { nomeAparelhoValido, NOME_APARELHO_MAX, NOME_APARELHO_MIN } from "@/lib/acesso-conta-core";
import { nomearAparelhoSchema } from "@/lib/acesso-validation";
import { estadoAparelhos, nomearAparelhoDaSessao } from "@/lib/aparelhos";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** A situação dos aparelhos da pessoa (a tela de nomear). */
export async function GET(req: Request) {
  const g = await exigirUsuarioLivre();
  if ("erro" in g) return g.erro;
  return ok({ estado: await estadoAparelhos(g.u, req.headers.get("user-agent")) });
}

/** NOMEAR o aparelho desta sessão (com a troca atômica quando a conta está lotada). */
export async function POST(req: Request) {
  const g = await exigirUsuarioLivre();
  if ("erro" in g) return g.erro;
  const corpo = await parseCorpo(nomearAparelhoSchema, req);
  if ("resp" in corpo) return corpo.resp;
  const nome = nomeAparelhoValido(corpo.data.nome);
  if (!nome) return erro(`O nome do aparelho precisa ter de ${NOME_APARELHO_MIN} a ${NOME_APARELHO_MAX} caracteres.`, 422);
  const r = await nomearAparelhoDaSessao(g.u, req, nome, corpo.data.removerIds ?? []);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error, situacao: r.situacao }, { status: r.status });
  const troca = (corpo.data.removerIds ?? []).length > 0;
  await registrarAuditoria({
    usuario: g.u,
    acao: troca ? "editar" : "criar",
    entidade: "aparelho",
    entidadeId: r.aparelhoId,
    resumo: troca ? `Aparelho trocado: "${nome}" entrou no lugar de ${(corpo.data.removerIds ?? []).length} aparelho(s)` : `Aparelho nomeado: "${nome}"`,
  });
  return ok({ aparelhoId: r.aparelhoId });
}
