import { escopoMesa } from "@/lib/acesso-mesa";
import { podePca } from "@/lib/acesso";
import { z } from "zod";
import { exigirSessao, recusa } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { type Excluido, excluidosDoHistorico, excluidoVisivel, itensDosDfdsExcluidos, limparLixeira, linhasParaLimpeza, listarExcluidos } from "@/lib/mesa-excluidos";
import { planoLimpeza } from "@/lib/mesa-excluidos-core";

export const dynamic = "force-dynamic";

const TIPOS = new Set<Excluido["tipo"]>(["protocolo", "dfd", "item"]);

// LIXEIRA DA MESA — a opção "Excluídos": os protocolos, DFDs ou itens excluídos de UMA Mesa (`?pca=` = a do PCA; sem ele,
// a do sistema), com o MESMO escopo das listas (a unidade acessível; "só os meus" = só o que a pessoa excluiu). Sem o
// retrato (vem ao abrir a linha).
export async function GET(req: Request) {
  const g = await exigirSessao();
  if ("erro" in g) return g.erro;
  const params = new URL(req.url).searchParams;
  const pca = Number(params.get("pca"));
  const doPca = Number.isInteger(pca) && pca > 0;
  const tipo = params.get("tipo") as Excluido["tipo"];
  if (!TIPOS.has(tipo)) return erro("Tipo inválido.", 422);
  const negado = recusa(g.acesso, doPca ? "pca" : "dfd", "visualizar");
  if (negado) return negado;
  if (doPca && !podePca(g.acesso, pca)) return erro("Sem acesso a este PCA.", 403);
  const esc = await escopoMesa();
  if (!esc) return erro("Faça login.", 401);
  const linhas = (await listarExcluidos(doPca ? pca : null, tipo)).filter((e) => excluidoVisivel(esc, g.u.id, e));
  // As exclusões ANTERIORES à lixeira, pelo histórico (sem retrato). Falha aqui não derruba a lista.
  const antigos = await excluidosDoHistorico(doPca ? pca : null, tipo)
    .then((xs) => xs.filter((e) => excluidoVisivel(esc, g.u.id, e)))
    .catch((e) => {
      console.error("[mesa-excluidos] histórico falhou:", e);
      return [];
    });
  // Na visão Itens, também os itens que saíram JUNTO com um DFD (ou com o protocolo inteiro).
  const doDfd = tipo === "item" ? (await itensDosDfdsExcluidos(doPca ? pca : null)).filter((e) => excluidoVisivel(esc, g.u.id, e)).map(({ excluidoPor: _p, ...e }) => e) : [];
  return ok({ excluidos: linhas, antigos, doDfd });
}

const limparSchema = z.strictObject({
  pca: z.number().int().positive().nullable(),
  /** As linhas escolhidas (o id da lixeira). */
  ids: z.array(z.number().int().positive()).max(5000).default([]),
  /** As exclusões antigas escolhidas (a chave `a<id>…`). */
  antigos: z.array(z.string().regex(/^a\d+[\w:-]*$/).max(80)).max(5000).default([]),
  /** Limpar TUDO o que a pessoa vê nesta Mesa (com `tipo`, só daquele tipo). */
  tudo: z.enum(["protocolo", "dfd", "item", "todos"]).optional(),
});

// LIMPAR A LIXEIRA — apaga DE VEZ do banco as linhas escolhidas (ou tudo o que a pessoa vê nesta Mesa); o protocolo leva
// junto os DFDs que saíram com ele. As exclusões antigas (do histórico) somem da lixeira; o histórico de alterações fica.
export async function DELETE(req: Request) {
  const g = await exigirSessao();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(limparSchema, req);
  if ("resp" in p) return p.resp;
  const { pca, ids, antigos, tudo } = p.data;
  const negado = recusa(g.acesso, pca ? "pca" : "dfd", "excluir");
  if (negado) return negado;
  if (pca && !podePca(g.acesso, pca)) return erro("Sem acesso a este PCA.", 403);
  const esc = await escopoMesa();
  if (!esc) return erro("Faça login.", 401);
  const visiveis = (await linhasParaLimpeza(pca)).filter((l) => excluidoVisivel(esc, g.u.id, l));
  const pedidas = new Set(tudo ? visiveis.filter((l) => tudo === "todos" || l.tipo === tudo).map((l) => l.id) : ids);
  const apagar = planoLimpeza(visiveis, pedidas);
  let chaves = antigos;
  if (tudo) {
    const tipos: Excluido["tipo"][] = tudo === "todos" ? ["protocolo", "dfd", "item"] : [tudo];
    const listas = await Promise.all(tipos.map((t) => excluidosDoHistorico(pca, t).catch(() => [])));
    chaves = listas.flat().filter((e) => excluidoVisivel(esc, g.u.id, e)).map((e) => e.chave);
  }
  if (!apagar.length && !chaves.length) return erro("Nada a limpar.", 422);
  await limparLixeira(apagar, chaves);
  await registrarAuditoria({
    usuario: g.u,
    acao: "excluir",
    entidade: "mesa_lixeira",
    entidadeId: pca ?? null,
    resumo: `Lixeira ${pca ? "da Mesa do PCA" : "da Mesa do sistema"} limpa: ${apagar.length} registro(s)${chaves.length ? ` + ${chaves.length} do histórico` : ""}${tudo ? " (tudo)" : ""}`,
  });
  return ok({ apagados: apagar.length, descartados: chaves.length });
}
