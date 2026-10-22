import { escopoMesa } from "@/lib/acesso-mesa";
import { podePca } from "@/lib/acesso";
import { exigirSessao, recusa } from "@/lib/api-auth";
import { erro, ok } from "@/lib/http";
import { type Excluido, excluidosDoHistorico, excluidoVisivel, listarExcluidos } from "@/lib/mesa-excluidos";

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
  return ok({ excluidos: linhas, antigos });
}
