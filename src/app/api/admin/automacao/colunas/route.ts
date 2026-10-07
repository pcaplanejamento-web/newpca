import { z } from "zod";
import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { ENTIDADES_COLUNA, MAX_COLUNAS_POR_ENTIDADE, MAX_NOME_COLUNA, nomeColuna } from "@/lib/mesa-colunas-core";
import { colunaPorNome, listarColunasMesa } from "@/lib/mesa-colunas";

export const dynamic = "force-dynamic";

/** As colunas da Mesa criadas pelas automações. */
export async function GET() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  return ok({ colunas: await listarColunasMesa() });
}

const corpoSchema = z.strictObject({ entidade: z.enum(ENTIDADES_COLUNA), nome: z.string().trim().min(1).max(MAX_NOME_COLUNA) });

/** A coluna pelo NOME — usa a cadastrada ou cria (idempotente; o nó "Gravar na coluna da Mesa"). */
export async function POST(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(corpoSchema, req);
  if ("resp" in p) return p.resp;
  if (!nomeColuna(p.data.nome)) return erro("Informe o nome da coluna.", 422);
  const r = await colunaPorNome(p.data.entidade, p.data.nome, g.u.id);
  if (!r) return erro(`No máximo ${MAX_COLUNAS_POR_ENTIDADE} colunas por tabela da Mesa.`, 409);
  if (r.criada)
    await registrarAuditoria({ usuario: g.u, acao: "criar", entidade: "automacao", origem: "centi", resumo: `Coluna da Mesa criada: ${r.coluna.nome} (${r.coluna.entidade})` });
  return ok(r);
}
