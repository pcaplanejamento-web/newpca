import { eq, notInArray } from "drizzle-orm";
import { frotaClassificacoes } from "@/db/schema";
import { exigirAcesso } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getDb } from "@/lib/db";
import { listarClassificacoesFrota } from "@/lib/frota";
import { classificacoesFrotaSchema } from "@/lib/frota-validation";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/** As CLASSIFICAÇÕES dos veículos (ambulância, ônibus, leve…). */
export async function GET() {
  const g = await exigirAcesso(["veiculos", "frotas", "combustivel", "manutencao"], "visualizar");
  if ("erro" in g) return g.erro;
  return ok({ classificacoes: await listarClassificacoesFrota() });
}

/**
 * Grava a LISTA inteira (na ordem): as com id são renomeadas/recoloridas, as sem id criadas, as que saíram excluídas (os
 * veículos delas ficam sem classificação — FK set null). Nome único sem caixa.
 */
export async function PUT(req: Request) {
  const g = await exigirAcesso("veiculos", "configurar");
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(classificacoesFrotaSchema, req);
  if ("resp" in p) return p.resp;
  const lista = p.data.classificacoes;
  const nomes = lista.map((c) => c.nome.toLocaleLowerCase("pt-BR"));
  if (new Set(nomes).size !== nomes.length) return erro("Há classificações com o mesmo nome.", 422);
  const atuais = await listarClassificacoesFrota();
  const ids = new Set(atuais.map((c) => c.id));
  if (lista.some((c) => c.id != null && !ids.has(c.id))) return erro("Classificação inexistente — recarregue a tela.", 409);
  const db = getDb();
  const ficam = lista.filter((c) => c.id != null).map((c) => c.id as number);
  const cmds = [
    // Excluir primeiro (o nome de uma que sai pode ser o de uma nova) e renomear com um nome provisório evita o índice único.
    db.delete(frotaClassificacoes).where(ficam.length ? notInArray(frotaClassificacoes.id, ficam) : undefined),
    ...lista
      .filter((c) => c.id != null)
      .map((c) => db.update(frotaClassificacoes).set({ nome: `~${c.id}` }).where(eqId(c.id as number))),
    ...lista.map((c, ordem) =>
      c.id != null
        ? db.update(frotaClassificacoes).set({ nome: c.nome, cor: c.cor, ordem }).where(eqId(c.id))
        : db.insert(frotaClassificacoes).values({ nome: c.nome, cor: c.cor, ordem }),
    ),
  ];
  await db.batch(cmds as never);
  await registrarAuditoria({
    usuario: g.u,
    acao: "editar",
    entidade: "veiculo",
    resumo: `Classificações dos veículos: ${lista.map((c) => c.nome).join(", ") || "nenhuma"}`,
  });
  return ok({ classificacoes: await listarClassificacoesFrota() });
}

const eqId = (id: number) => eq(frotaClassificacoes.id, id);
