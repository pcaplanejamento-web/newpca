import { escopoMesa, protocoloNasLinhas } from "@/lib/acesso-mesa";
import { exigirAcesso } from "@/lib/api-auth";
import { idDoFiltro } from "@/lib/escopo-unidades-core";
import { erro, ok } from "@/lib/http";
import { execucaoDaMesa } from "@/lib/mesa-dados";
import { redigirExecucao } from "@/lib/mesa-redacao";
import { execucaoMesaSchema } from "@/lib/mesa-validation";
import { pessoasPorIds } from "@/lib/usuarios";

export const dynamic = "force-dynamic";

// HISTÓRICO DE EXECUÇÃO da Mesa principal — as métricas de governança do Dashboard (correções e ações por pessoa),
// carregado SÓ com o Dashboard aberto. O mesmo escopo das listas da Mesa: a unidade ativa (Geral = todas), o PCA do
// CABEÇALHO com que a página foi carregada (`?ano=`; ausente = todos) e só os protocolos fora de um PCA. Devolve as
// tuplas [protocolo, pessoa, dia, tipo, n] + as pessoas (foto + apelido) de quem agiu. Os DETALHES do papel valem: só as
// LINHAS da pessoa ("só os meus") e, sem o desempenho por pessoa, só as correções — sem quem as fez.
export async function GET(req: Request) {
  const g = await exigirAcesso("dfd", "visualizar");
  if ("erro" in g) return g.erro;
  const q = execucaoMesaSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) return erro("Parâmetros inválidos.", 422);
  const esc = await escopoMesa();
  if (!esc) return erro("Faça login.", 401);
  // O MESMO escopo das listas da Mesa: a unidade ativa (a "Geral" = todas; sem grupo/unidade = nada).
  const rep = idDoFiltro(esc.un.filtro);
  const brutas = rep === false ? [] : await execucaoDaMesa(rep, q.data.ano ?? null);
  const atividades = redigirExecucao(brutas, esc.vis, (id) => protocoloNasLinhas(esc, id));
  const pessoas = esc.vis.desempenho ? await pessoasPorIds(atividades.map((a) => a[1])) : [];
  return ok({ atividades, pessoas });
}
