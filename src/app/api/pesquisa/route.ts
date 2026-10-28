import { componenteLibera, gruposDeTarefas, podeTela } from "@/lib/acesso";
import type { AbaKey } from "@/lib/abas";
import { exigirSessao } from "@/lib/api-auth";
import { ok } from "@/lib/http";
import { pesquisarOutros } from "@/lib/pesquisa";
import { ehTipoPesquisa, type PortaoPesquisa, pontuar, TIPOS_PADRAO, type TipoPesquisa, tipoPermitido } from "@/lib/pesquisa-core";
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
  const tipos: TipoPesquisa[] = pedidos.length ? pedidos.slice(0, TIPOS_PADRAO.length) : TIPOS_PADRAO;
  const limite = Math.min(50, Math.max(1, Number(sp.get("limite")) || 8));
  if (q.length < 2) return ok({ grupos: [] });
  // A régua ÚNICA (testada por perfil): o tipo que a pessoa não abre nem é consultado.
  const portao: PortaoPesquisa = {
    admin: a.u.admin,
    ve: (t) => podeTela(a.acesso, t as AbaKey).visualizar,
    libera: (c) => componenteLibera(a.acesso, c),
  };
  // A ordem: exato › começa › contém (estável) — o melhor de cada grupo vem primeiro.
  const ordenar = <T extends { rotulo: string; detalhe: string }>(l: T[]) =>
    l
      .map((o, i) => ({ o, i, p: pontuar(`${o.rotulo} ${o.detalhe}`, q) }))
      .sort((x, y) => y.p - x.p || x.i - y.i)
      .map((x) => x.o);
  const grupos = await Promise.all(
    tipos.filter((t) => tipoPermitido(portao, t)).map(async (tipo) => {
      // Protocolo, DFD e item: só os da Mesa que a pessoa abre, já com o link dessa Mesa.
      if (tipo === "protocolo" || tipo === "dfd" || tipo === "item") {
        const opcoes = await pesquisarMesa(a.acesso, tipo, q, 50);
        return { tipo, total: opcoes.length, opcoes: ordenar(opcoes).slice(0, limite) };
      }
      if (tipo === "tarefa" || tipo === "orcamento") {
        const opcoes = await buscarVinculos(a.u, tipo, q, gruposDeTarefas(a.acesso, "visualizar", true));
        return { tipo, total: opcoes.length, opcoes: ordenar(opcoes).slice(0, limite) };
      }
      // Só UM tipo pedido = a pessoa procura nele (o prefixo): os de tabela grande procuram também no texto.
      const opcoes = await pesquisarOutros(a.acesso, tipo, q, 50, tipos.length === 1);
      return opcoes ? { tipo, total: opcoes.length, opcoes: ordenar(opcoes).slice(0, limite) } : null;
    }),
  );
  return ok({ grupos: grupos.filter((g) => g && g.total > 0) });
}
