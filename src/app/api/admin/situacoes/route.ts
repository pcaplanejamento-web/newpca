import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { situacaoProtocoloSchema } from "@/lib/dfd-validation";
import { ok, parseCorpo } from "@/lib/http";
import { criarSituacao, listarSituacoesComUso } from "@/lib/situacoes";

export const dynamic = "force-dynamic";

/** Situações do protocolo (Configurações → Situações) com quantos protocolos usam cada uma. */
export async function GET() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  return ok({ situacoes: await listarSituacoesComUso() });
}

export async function POST(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(situacaoProtocoloSchema, req);
  if ("resp" in p) return p.resp;
  const r = await criarSituacao(p.data);
  await registrarAuditoria({ usuario: g.u, acao: "criar", entidade: "situacao_protocolo", entidadeId: r.id, resumo: `Situação "${p.data.nome}" criada`, depois: p.data });
  return ok({ id: r.id });
}
