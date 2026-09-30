import { atorPasta } from "@/lib/acesso";
import { exigirSessao } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { moverQuadroParaPasta, pastaAcessivel, quadroAcessivel } from "@/lib/tarefas";
import { moverParaPastaSchema } from "@/lib/tarefas-validation";

export const dynamic = "force-dynamic";

/**
 * O ARRASTO da grade: põe o quadro na pasta (`null` = solta na raiz) entre os vizinhos de dentro dela. Entrando na PRIVADA
 * o quadro vira privado; `tornarPublico` = saindo da privada, volta a ser do grupo (só o dono).
 */
export async function POST(req: Request) {
  const a = await exigirSessao();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(moverParaPastaSchema, req);
  if ("resp" in p) return p.resp;
  const q = await quadroAcessivel(a.u, p.data.quadroId);
  if (!q) return erro("Quadro não encontrado.", 404);
  const destino = p.data.pastaId ? await pastaAcessivel(a.u, p.data.pastaId) : null;
  if (p.data.pastaId && !destino) return erro("Pasta não encontrada.", 404);
  const mudouDePasta = (q.pastaId ?? null) !== (p.data.pastaId ?? null);
  const motivo = await moverQuadroParaPasta(a.u, atorPasta(a.acesso), q, destino, { antesDe: p.data.antesDe, depoisDe: p.data.depoisDe }, !!p.data.tornarPublico);
  if (motivo) return erro(motivo, 403);
  if (mudouDePasta)
    await registrarAuditoria({
      usuario: a.u,
      acao: "editar",
      entidade: "tarefa_quadro",
      entidadeId: q.id,
      resumo: destino ? `Quadro "${q.nome}" posto na pasta "${destino.nome}"${destino.privado && !q.privado ? " (virou privado)" : ""}` : `Quadro "${q.nome}" tirado da pasta${p.data.tornarPublico && q.privado ? " (visível ao grupo)" : ""}`,
    });
  return ok();
}
