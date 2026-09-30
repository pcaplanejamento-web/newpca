import { exigirUsuario } from "@/lib/api-auth";
import { idDoFiltro } from "@/lib/escopo-unidades-core";
import { unidadesDaSessao } from "@/lib/grupos";
import { erro, ok } from "@/lib/http";
import { execucaoDaMesa } from "@/lib/mesa-dados";
import { execucaoMesaSchema } from "@/lib/mesa-validation";
import { pessoasPorIds } from "@/lib/usuarios";

export const dynamic = "force-dynamic";

// HISTÓRICO DE EXECUÇÃO da Mesa principal — as métricas de governança do Dashboard (correções e ações por pessoa),
// carregado SÓ com o Dashboard aberto. O mesmo escopo das listas da Mesa: a unidade ativa (Geral = todas), o PCA do
// CABEÇALHO com que a página foi carregada (`?ano=`; ausente = todos) e só os protocolos fora de um PCA. Devolve as
// tuplas [protocolo, pessoa, dia, tipo, n] + as pessoas (foto + apelido) de quem agiu.
export async function GET(req: Request) {
  const g = await exigirUsuario();
  if ("erro" in g) return g.erro;
  const q = execucaoMesaSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) return erro("Parâmetros inválidos.", 422);
  // O MESMO escopo das listas da Mesa: a unidade ativa (a "Geral" = todas; sem grupo/unidade = nada).
  const rep = idDoFiltro((await unidadesDaSessao(g.u)).filtro);
  const atividades = rep === false ? [] : await execucaoDaMesa(rep, q.data.ano ?? null);
  const pessoas = await pessoasPorIds(atividades.map((a) => a[1]));
  return ok({ atividades, pessoas });
}
