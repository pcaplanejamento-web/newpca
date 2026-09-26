import { lerAgendaExterna, criarExterno, listarExternos } from "@/lib/agendas-externas";
import { exigirUsuario } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { eventosExternos, MAX_AGENDAS_EXTERNAS, urlAgendaValida } from "@/lib/ics-core";
import { externoSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

const dataOk = (d: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);

/** As AGENDAS EXTERNAS da pessoa; com `?de=&ate=` (≤ 400 dias), já com os eventos do intervalo (cada agenda com o seu erro). */
export async function GET(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const sp = new URL(req.url).searchParams;
  const de = dataOk(sp.get("de"));
  const ate = dataOk(sp.get("ate"));
  const cadastros = await listarExternos(a.u.id);
  if (!de || !ate || ate < de || Date.parse(ate) - Date.parse(de) > 400 * 86_400_000) return ok({ agendas: cadastros.map((c) => ({ ...c, eventos: [], erro: null })) });
  const agendas = await Promise.all(
    cadastros.map(async (c) => {
      try {
        const evs = await lerAgendaExterna(c.url);
        return { ...c, eventos: eventosExternos([{ id: c.id, nome: c.nome, cor: c.cor, eventos: evs }], de, ate), erro: null };
      } catch (e) {
        return { ...c, eventos: [], erro: e instanceof Error ? e.message : "Falha ao ler a agenda." };
      }
    }),
  );
  return ok({ agendas });
}

/** Assina uma agenda: o link é conferido (baixado e lido) antes de gravar. */
export async function POST(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(externoSchema, req);
  if ("resp" in p) return p.resp;
  const url = urlAgendaValida(p.data.url);
  if (!url) return erro("Link inválido: use um endereço https:// (ou webcal://) público.", 422);
  if ((await listarExternos(a.u.id)).length >= MAX_AGENDAS_EXTERNAS) return erro(`Até ${MAX_AGENDAS_EXTERNAS} agendas externas por pessoa.`, 409);
  let n = 0;
  try {
    n = (await lerAgendaExterna(url)).length;
  } catch (e) {
    return erro(e instanceof Error ? e.message : "Não foi possível ler a agenda.", 422);
  }
  const id = await criarExterno(a.u.id, { nome: p.data.nome, url, cor: p.data.cor });
  await registrarAuditoria({ usuario: a.u, acao: "criar", entidade: "agenda_externa", entidadeId: id, resumo: `Agenda externa "${p.data.nome}" assinada (${n} evento(s))` });
  return ok({ id, eventos: n });
}
