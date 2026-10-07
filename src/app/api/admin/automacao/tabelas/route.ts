import { z } from "zod";
import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { excluirTabela, gravarTabela, listarTabelas, lerTabela } from "@/lib/automacao-tabelas";
import { MAX_LINHAS_TABELA, MAX_NOME_TABELA } from "@/lib/fluxo-dados";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

const nomeSchema = z.string().trim().min(1).max(MAX_NOME_TABELA);

/** As tabelas salvas pelas automações; `?nome=` = uma, com as linhas. */
export async function GET(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const nome = new URL(req.url).searchParams.get("nome");
  if (!nome) return ok({ tabelas: await listarTabelas() });
  const t = await lerTabela(nome);
  return t ? ok({ tabela: t }) : erro("Tabela não encontrada.", 404);
}

const corpoSchema = z.strictObject({
  nome: nomeSchema,
  modo: z.enum(["substituir", "acrescentar"]),
  linhas: z.array(z.record(z.string(), z.unknown())).max(MAX_LINHAS_TABELA),
});

/** Grava a tabela (o nó "Salvar em tabela"). */
export async function POST(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(corpoSchema, req);
  if ("resp" in p) return p.resp;
  const r = await gravarTabela(p.data.nome, p.data.linhas, p.data.modo, g.u.id);
  await registrarAuditoria({ usuario: g.u, acao: "editar", entidade: "automacao", origem: "centi", resumo: `Tabela “${p.data.nome}” gravada: ${r.total} linha(s)` });
  return ok(r);
}

/** Exclui a tabela `?nome=`. */
export async function DELETE(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const nome = nomeSchema.safeParse(new URL(req.url).searchParams.get("nome") ?? "");
  if (!nome.success) return erro("Informe a tabela.", 400);
  if (!(await excluirTabela(nome.data))) return erro("Tabela não encontrada.", 404);
  await registrarAuditoria({ usuario: g.u, acao: "excluir", entidade: "automacao", origem: "centi", resumo: `Tabela “${nome.data}” excluída` });
  return ok();
}
