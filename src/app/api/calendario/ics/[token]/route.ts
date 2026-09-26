import { usuarioDoToken } from "@/lib/calendario-assinatura";
import { carimboIcs, gerarIcs, linkEvento } from "@/lib/calendario-core";
import { tokenAssinaturaValido } from "@/lib/calendario-validation";
import { dataIsoBrasilia } from "@/lib/format";
import { gruposDoUsuario } from "@/lib/grupos";
import { listarPreferenciasTabela } from "@/lib/preferencias-tabela";
import { eventosDosQuadros, listarQuadros, tarefasDoCalendario } from "@/lib/tarefas";
import { CHAVE_OCULTOS_CALENDARIO, eventosDoCalendario, eventoVisivel, lerOcultos, mascararPrivados, somarDias } from "@/lib/tarefas-core";

export const dynamic = "force-dynamic";

/**
 * O FEED de ASSINATURA do calendário (`.ics`, RFC 5545) — o Google Agenda, o Outlook e o celular assinam este link e
 * sincronizam sozinhos. Sem sessão: o TOKEN (só o hash fica no banco) identifica a pessoa ativa; mostra o que ELA vê no
 * módulo (os quadros dos grupos dela, sem o que deixou oculto), de 60 dias atrás a 1 ano à frente. Só leitura.
 */
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const token = (await ctx.params).token.replace(/\.ics$/i, "");
  const u = tokenAssinaturaValido(token) ? await usuarioDoToken(token) : null;
  if (!u) return new Response("Link de calendário inválido ou desligado.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const hoje = dataIsoBrasilia(new Date().toISOString());
  const de = somarDias(hoje, -60);
  const ate = somarDias(hoje, 365);
  const grupos = u.role === "admin" ? null : (await gruposDoUsuario(u.id)).map((g) => g.id);
  const quadros = (await listarQuadros(grupos, hoje)).filter((q) => !q.arquivado);
  const ids = quadros.map((q) => q.id);
  const [tarefas, eventos, prefs] = await Promise.all([tarefasDoCalendario(ids, de, ate), eventosDosQuadros(ids, de, ate), listarPreferenciasTabela(u.id, CHAVE_OCULTOS_CALENDARIO)]);
  const ocultos = lerOcultos(prefs[CHAVE_OCULTOS_CALENDARIO]);
  const origem = new URL(req.url).origin;
  const visiveis = mascararPrivados(eventos, u.id, new Map(tarefas.map((t) => [t.id, t.pessoas])));
  const lista = eventosDoCalendario(tarefas, visiveis, de, ate, hoje).filter((e) => eventoVisivel(e, ocultos));
  const ics = gerarIcs(lista, { nome: `Calendário — ${u.nome}`, agora: carimboIcs(new Date()), dominio: new URL(req.url).hostname, url: (e) => `${origem}${linkEvento(e.inicio, e.chave)}` });
  return new Response(ics, {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'inline; filename="calendario.ics"', "Cache-Control": "private, max-age=300" },
  });
}
