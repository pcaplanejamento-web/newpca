import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { textoAlvoAnexo } from "@/lib/automacao-core";
import { getExecucao, registrarEscrita, registrosDosProtocolos } from "@/lib/automacao-plataforma";
import { registrarSchema } from "@/lib/automacao-validation";
import { erro, ok, parseCorpo } from "@/lib/http";
import { nomeExibicao } from "@/lib/pessoa";

export const dynamic = "force-dynamic";

/** As escritas feitas na Centi pelos protocolos do sistema (`?protocolos=1,2,3`, até 2000). */
export async function GET(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const ids = [
    ...new Set(
      (new URL(req.url).searchParams.get("protocolos") ?? "")
        .split(",")
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  ].slice(0, 2000);
  return ok({ registros: ids.length ? await registrosDosProtocolos(ids) : [] });
}

/** Registra UMA escrita feita na Centi (idempotente: a mesma de novo não muda nada) + auditoria. */
export async function POST(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(registrarSchema, req);
  if ("resp" in p) return p.resp;
  const x = await getExecucao(p.data.execucaoId);
  if (!x || x.execucao.usuarioId !== g.u.id) return erro("Execução não encontrada.", 404);
  if (!x.passos.some((s) => s.chave === p.data.chave && s.capacidade === p.data.capacidade)) return erro("Passo desconhecido nesta execução.", 422);
  const descricao = textoAlvoAnexo(p.data.alvo).split("|")[4];
  const novo = await registrarEscrita({
    capacidade: p.data.capacidade,
    centiAlvo: p.data.alvo.id,
    descricao,
    centiDocumento: p.data.centiDocumento,
    protocoloId: p.data.protocoloId,
    execucaoId: p.data.execucaoId,
    usuarioId: g.u.id,
    usuarioNome: nomeExibicao(g.u),
  });
  if (novo)
    await registrarAuditoria({
      usuario: g.u,
      acao: "criar",
      entidade: "automacao",
      entidadeId: p.data.execucaoId,
      protocoloId: p.data.protocoloId ?? undefined,
      origem: "centi",
      resumo: `Anexado na Centi: “${p.data.alvo.descricao}” no protocolo ${p.data.alvo.numero}${p.data.alvo.ano ? `/${p.data.alvo.ano}` : ""} (Id ${p.data.alvo.id}${p.data.centiDocumento ? `, documento ${p.data.centiDocumento}` : ""})`,
    });
  return ok({ novo });
}
