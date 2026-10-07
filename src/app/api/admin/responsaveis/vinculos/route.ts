import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { vinculoResponsavelSchema } from "@/lib/rbac-validation";
import { alvoExiste, conflitoDoVinculo, criarVinculo, getPessoa, motivoAlvoInvalido } from "@/lib/responsaveis";
import { motivoVinculoInvalido, normalizarVinculo, rotuloVinculo } from "@/lib/responsaveis-planilha-core";

export const dynamic = "force-dynamic";

/** VINCULA uma pessoa da planilha a uma unidade OU a um órgão (padrão ou temporário). */
export async function POST(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(vinculoResponsavelSchema, req);
  if ("resp" in p) return p.resp;
  const d = { ...p.data, ...normalizarVinculo(p.data) };
  const invalido = motivoVinculoInvalido(d);
  if (invalido) return erro(invalido, 422);
  const pessoa = await getPessoa(d.responsavelId);
  if (!pessoa) return erro("Pessoa não encontrada na planilha.", 422);
  if (!(await alvoExiste(d))) return erro("Unidade ou órgão não encontrado.", 422);
  const naoVale = await motivoAlvoInvalido(d);
  if (naoVale) return erro(naoVale, 422);
  const conflito = await conflitoDoVinculo(d);
  if (conflito) return erro(conflito, 409);
  const id = await criarVinculo(d);
  await registrarAuditoria({
    usuario: g.u,
    acao: "criar",
    entidade: "responsavel",
    entidadeId: d.responsavelId,
    resumo: `${pessoa.nome} vinculado(a) — ${rotuloVinculo(d)}${d.orgaoId != null ? ` no órgão #${d.orgaoId}` : ` na unidade #${d.reparticaoId}`}`,
    depois: d,
  });
  return ok({ id });
}
