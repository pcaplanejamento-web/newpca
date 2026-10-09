import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { receitaAtiva, receitaPorId } from "@/lib/automacao-core";
import { criarExecucao, getConfigAutomacao, listarExecucoes } from "@/lib/automacao-plataforma";
import { criarExecucaoSchema } from "@/lib/automacao-validation";
import { erro, ok, parseCorpo } from "@/lib/http";
import { nomeExibicao } from "@/lib/pessoa";

export const dynamic = "force-dynamic";

/** O histórico: as últimas execuções. */
export async function GET() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  return ok({ execucoes: await listarExecucoes() });
}

/** Cria a execução a partir do PLANO da receita (os passos) — preparada; nada roda na Centi aqui. */
export async function POST(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(criarExecucaoSchema, req);
  if ("resp" in p) return p.resp;
  const r = receitaPorId(p.data.receita);
  if (!r) return erro("Receita desconhecida.", 422);
  if (!receitaAtiva(await getConfigAutomacao(), r.id)) return erro(`A receita “${r.nome}” está desligada.`, 409);
  // Negado por padrão: cada passo só com uma capacidade que a receita declara.
  const fora = p.data.passos.find((x) => !r.capacidades.includes(x.capacidade));
  if (fora) return erro(`A receita “${r.nome}” não usa “${fora.capacidade}”.`, 422);
  const id = await criarExecucao({
    receita: r.id,
    versao: r.versao,
    usuarioId: g.u.id,
    usuarioNome: nomeExibicao(g.u),
    ensaio: p.data.ensaio,
    entrada: p.data.entrada,
    passos: p.data.passos,
  });
  await registrarAuditoria({
    usuario: g.u,
    acao: "criar",
    entidade: "automacao",
    entidadeId: id,
    origem: "centi",
    resumo: `${p.data.ensaio ? "Ensaio" : "Execução"} de “${r.nome}” — ${p.data.passos.length} passo(s)`,
  });
  return ok({ id });
}
