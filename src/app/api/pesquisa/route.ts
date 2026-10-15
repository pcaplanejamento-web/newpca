import { gruposDeTarefas, podePca, podeTela } from "@/lib/acesso";
import { exigirSessao } from "@/lib/api-auth";
import { ok } from "@/lib/http";
import { buscarVinculos, pesquisarMesa } from "@/lib/tarefas";
import { ehTipoVinculo, type TipoVinculo } from "@/lib/tarefas-core";

export const dynamic = "force-dynamic";

/** Sem `tipos`, a pesquisa geral do banner. */
const PADRAO: TipoVinculo[] = ["protocolo", "dfd", "item", "tarefa", "orcamento"];

/**
 * A PESQUISA DO SISTEMA (o banner do menu, Ctrl+K): `?q=&tipos=protocolo,dfd` — os mesmos resultados da busca dos
 * vínculos (no escopo de unidades e só das telas que o papel VÊ), num pedido só, por tipo, até `limite` cada.
 */
export async function GET(req: Request) {
  const a = await exigirSessao();
  if ("erro" in a) return a.erro;
  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") ?? "").trim().slice(0, 80);
  const pedidos = (sp.get("tipos") ?? "").split(",").filter(ehTipoVinculo);
  const tipos = pedidos.length ? pedidos.slice(0, 6) : PADRAO;
  const limite = Math.min(50, Math.max(1, Number(sp.get("limite")) || 8));
  const ve = (t: "dfd" | "pca" | "orcamento") => podeTela(a.acesso, t).visualizar;
  const visivel = (t: TipoVinculo) => (t === "tarefa" ? true : t === "pca" ? ve("pca") : t === "orcamento" ? ve("orcamento") : ve("dfd") || ve("pca"));
  if (q.length < 2) return ok({ grupos: [] });
  const grupos = await Promise.all(
    tipos.filter(visivel).map(async (tipo) => {
      // Protocolo, DFD e item: só os da Mesa que a pessoa abre, já com o link dessa Mesa.
      if (tipo === "protocolo" || tipo === "dfd" || tipo === "item") {
        const opcoes = await pesquisarMesa(a.acesso, tipo, q, 50);
        return { tipo, total: opcoes.length, opcoes: opcoes.slice(0, limite) };
      }
      const todas = await buscarVinculos(a.u, tipo, q, gruposDeTarefas(a.acesso, "visualizar", true));
      const opcoes = tipo === "pca" ? todas.filter((o) => podePca(a.acesso, o.id)) : todas;
      return { tipo, total: opcoes.length, opcoes: opcoes.slice(0, limite) };
    }),
  );
  return ok({ grupos });
}
