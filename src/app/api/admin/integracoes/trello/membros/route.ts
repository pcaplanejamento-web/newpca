import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { ErroTrello, type MembroTrelloApi } from "@/lib/trello-api";
import { trelloDaConfig } from "@/lib/trello-config";
import { gravarLigacoesMembros, listarLigacoesMembros } from "@/lib/trello-sync";
import { sugerirMembros } from "@/lib/trello-sync-core";
import { ligacoesMembrosSchema } from "@/lib/trello-validation";
import { listarPessoasDoGrupo } from "@/lib/usuarios";

export const dynamic = "force-dynamic";

/**
 * As PESSOAS do sistema e os MEMBROS do Trello (das áreas de trabalho da conta institucional), as ligações gravadas e as
 * SUGESTÕES (nome/usuário que casa com uma pessoa só). Sem conexão com o Trello, vêm as pessoas e as ligações + o motivo.
 */
export async function GET() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const [pessoas, ligacoes] = await Promise.all([listarPessoasDoGrupo(null), listarLigacoesMembros()]);
  const t = await trelloDaConfig();
  let membros: MembroTrelloApi[] = [];
  let aviso: string | null = "erro" in t ? t.erro : null;
  if (!("erro" in t))
    try {
      membros = await t.cliente.membrosDasAreas();
    } catch (e) {
      aviso = (e as Error).message;
    }
  return ok({ pessoas, ligacoes, membros, sugestoes: sugerirMembros(pessoas, membros, ligacoes), aviso });
}

/** Grava as ligações (o usuário digitado é conferido no Trello). */
export async function PUT(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(ligacoesMembrosSchema, req);
  if ("resp" in p) return p.resp;
  const precisaTrello = p.data.ligacoes.some((l) => l.membroId || l.usuarioTrello);
  const t = precisaTrello ? await trelloDaConfig() : null;
  if (t && "erro" in t) return erro(t.erro, 422);
  const cliente = t && !("erro" in t) ? t.cliente : null;
  const resolvidas: { usuarioId: number; membro: MembroTrelloApi | null }[] = [];
  try {
    for (const l of p.data.ligacoes) {
      const chave = l.membroId ?? l.usuarioTrello ?? null;
      resolvidas.push({ usuarioId: l.usuarioId, membro: chave && cliente ? await cliente.membro(chave) : null });
    }
  } catch (e) {
    return erro(e instanceof ErroTrello && e.status === 404 ? "Usuário do Trello não encontrado." : (e as Error).message, 422);
  }
  if (new Set(resolvidas.flatMap((r) => (r.membro ? [r.membro.id] : []))).size !== resolvidas.filter((r) => r.membro).length)
    return erro("O mesmo membro do Trello foi escolhido para duas pessoas.", 422);
  await gravarLigacoesMembros(resolvidas);
  await registrarAuditoria({
    usuario: g.u,
    acao: "editar",
    entidade: "trello_integracao",
    resumo: `Membros do Trello: ${resolvidas.filter((r) => r.membro).length} ligado(s), ${resolvidas.filter((r) => !r.membro).length} desligado(s)`,
  });
  return ok({ ligacoes: await listarLigacoesMembros() });
}
