import { exigirAdmin } from "@/lib/api-auth";
import { motivoNaoEscrever, textoAlvoAnexo } from "@/lib/automacao-core";
import { consumirAutorizacao, getConfigAutomacao, getExecucao } from "@/lib/automacao-plataforma";
import { consumirSchema } from "@/lib/automacao-validation";
import { erro, ok } from "@/lib/http";
import { iguaisEmTempoConstante, sha256Hex } from "@/lib/password";
import { hashToken } from "@/lib/trello-sync-core";

export const dynamic = "force-dynamic";

/**
 * CONSUMIDA PELA EXTENSÃO (o serviço dela, com o cookie da sessão), logo antes de gravar na Centi: a autorização vale
 * UMA vez, só para quem a pediu, dentro da validade, para a MESMA capacidade e o MESMO alvo — e o freio é conferido de
 * novo. O pedido vem da extensão (Origin chrome-extension://…) ou do próprio site; de outro site, nunca.
 */
export async function POST(req: Request) {
  const origem = req.headers.get("origin") ?? "";
  const proprio = (() => {
    try {
      return origem === new URL(req.url).origin;
    } catch {
      return false;
    }
  })();
  if (origem && !proprio && !/^chrome-extension:\/\/[a-p]{32}$/.test(origem)) return erro("Origem não permitida.", 403);
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const p = consumirSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return erro("Pedido inválido.", 422);
  const a = await consumirAutorizacao(await hashToken(p.data.token), g.u.id);
  if (!a) return erro("Autorização inválida, já usada ou vencida.", 403);
  if (a.capacidade !== p.data.capacidade || !iguaisEmTempoConstante(a.alvoHash, await sha256Hex(textoAlvoAnexo(p.data.alvo))))
    return erro("A autorização não é para este alvo.", 403);
  const x = await getExecucao(a.execucaoId);
  if (x?.execucao.estado !== "rodando") return erro("A execução não está rodando.", 409);
  const motivo = motivoNaoEscrever(await getConfigAutomacao(), x.execucao.receita, a.capacidade);
  if (motivo) return erro(motivo, 423);
  return ok({ execucaoId: a.execucaoId, chave: a.passoChave });
}
