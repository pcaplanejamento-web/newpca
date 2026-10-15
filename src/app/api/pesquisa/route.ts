import { gruposDeTarefas, podeTela } from "@/lib/acesso";
import { exigirSessao } from "@/lib/api-auth";
import { ok } from "@/lib/http";
import { pesquisarOutros } from "@/lib/pesquisa";
import { ehTipoPesquisa, TIPOS_PADRAO, type TipoPesquisa } from "@/lib/pesquisa-core";
import { buscarVinculos, pesquisarMesa } from "@/lib/tarefas";

export const dynamic = "force-dynamic";

/**
 * A PESQUISA DO SISTEMA (o banner do menu, Ctrl+K): `?q=&tipos=protocolo,dfd` — por tipo (`TIPOS_PESQUISA`), até `limite`
 * cada. Cada tipo só sai para quem abre a tela/aba em que o dado está (a administração, só o ADM) e o link é o dessa tela.
 */
export async function GET(req: Request) {
  const a = await exigirSessao();
  if ("erro" in a) return a.erro;
  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") ?? "").trim().slice(0, 80);
  const pedidos = (sp.get("tipos") ?? "").split(",").filter(ehTipoPesquisa);
  const tipos: TipoPesquisa[] = pedidos.length ? pedidos.slice(0, 8) : TIPOS_PADRAO;
  const limite = Math.min(50, Math.max(1, Number(sp.get("limite")) || 8));
  if (q.length < 2) return ok({ grupos: [] });
  const grupos = await Promise.all(
    tipos.map(async (tipo) => {
      // Protocolo, DFD e item: só os da Mesa que a pessoa abre, já com o link dessa Mesa.
      if (tipo === "protocolo" || tipo === "dfd" || tipo === "item") {
        const opcoes = await pesquisarMesa(a.acesso, tipo, q, 50);
        return { tipo, total: opcoes.length, opcoes: opcoes.slice(0, limite) };
      }
      if (tipo === "tarefa" || tipo === "orcamento") {
        if (tipo === "orcamento" && !podeTela(a.acesso, "orcamento").visualizar) return null;
        const opcoes = await buscarVinculos(a.u, tipo, q, gruposDeTarefas(a.acesso, "visualizar", true));
        return { tipo, total: opcoes.length, opcoes: opcoes.slice(0, limite) };
      }
      const opcoes = await pesquisarOutros(a.acesso, tipo, q, 50);
      return opcoes ? { tipo, total: opcoes.length, opcoes: opcoes.slice(0, limite) } : null;
    }),
  );
  return ok({ grupos: grupos.filter((g) => g && g.total > 0) });
}
