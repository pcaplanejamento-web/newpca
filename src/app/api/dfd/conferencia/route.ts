import { dfdsLegiveisNaMesa, escopoMesa } from "@/lib/acesso-mesa";
import { exigirAcesso } from "@/lib/api-auth";
import { getRegrasAvaliacao } from "@/lib/avaliacao";
import { classificarAssunto } from "@/lib/avaliacao-core";
import { gravarGuardadas, guardadoValido, lerGuardadas } from "@/lib/conferencia-cache";
import { assinaturaDfd, type ConfLinha, chavesUnidades, chaveContexto } from "@/lib/conferencia-cache-core";
import { avaliarLinhaDfd, gravacaoIncompleta } from "@/lib/conferencia-dfd";
import { listarDfdsCompletosPorIds } from "@/lib/dfd";
import { conferenciaDfdsSchema } from "@/lib/dfd-validation";
import { erro, ok, parseCorpo } from "@/lib/http";
import { listarOrgaos } from "@/lib/orgaos";
import { unidadesConferencia } from "@/lib/reparticoes";
import { contarTentativa, respostaLimite } from "@/lib/seguranca-acesso";

export const dynamic = "force-dynamic";

/**
 * CONFERÊNCIA da lista de DFDs da Mesa — a MESMA da análise (`avaliarLinhaDfd`: estado + resumo da
 * célula + validação da assinatura), calculada no servidor sobre o DFD COMPLETO (itens/seções/
 * assinaturas) e a unidade REAL de cada um. O cliente pede em fatias de ids (lazy, depois do load),
 * então a lista abre leve e o Estado de cada linha chega em seguida ("Conferindo…").
 * Leitura: só os DFDs que a pessoa LÊ (como `GET /api/dfd/[id]`).
 * CONFERÊNCIA GUARDADA (`conferencias`): o resultado de cada DFD fica com a ASSINATURA de entrada — o mesmo DFD com a mesma
 * assinatura não é recalculado (`fresco` = o "Reverificar tudo": recalcula e regrava, com limite de ritmo).
 */
export async function POST(req: Request) {
  const a = await exigirAcesso(["dfd", "pca"], "visualizar");
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(conferenciaDfdsSchema, req);
  if ("resp" in p) return p.resp;
  const [todos, regras, orgaos, esc] = await Promise.all([listarDfdsCompletosPorIds(p.data.ids), getRegrasAvaliacao(), listarOrgaos(), escopoMesa()]);
  if (!esc) return erro("Faça login.", 401);
  if (p.data.fresco) {
    const esperar = await contarTentativa("conferenciaFresca", String(a.u.id));
    if (esperar > 0) return respostaLimite(esperar);
  }
  // Só os DFDs que a pessoa LÊ (a unidade dele ou a do protocolo no escopo, e as linhas dela) — os demais somem da resposta.
  const dfds = await dfdsLegiveisNaMesa(esc, todos);
  const [lista, ctx, guardadas] = await Promise.all([
    unidadesConferencia(dfds.map((d) => d.reparticaoId)),
    chaveContexto(regras, orgaos),
    p.data.fresco
      ? Promise.resolve(new Map())
      : lerGuardadas(
          "dfd",
          dfds.map((d) => d.id),
        ),
  ]);
  const unidades = new Map(lista.map((u) => [u.id, u]));
  const hashes = await chavesUnidades(lista);
  const gravar: { alvoId: number; assinatura: string; resultado: string }[] = [];
  const linhas = dfds.map((d): ConfLinha => {
    const assinatura = assinaturaDfd(d, ctx, hashes);
    const guardado = guardadoValido<ConfLinha>(guardadas.get(d.id), assinatura);
    if (guardado) return { ...guardado, id: d.id };
    // O DFD GRAVADO pela metade (gravação em lotes que falhou no meio) é ERRO até reenviar.
    const r = avaliarLinhaDfd({ ...d, gravacaoIncompleta: gravacaoIncompleta(d) }, d.reparticaoId != null ? (unidades.get(d.reparticaoId) ?? null) : null, {
      anoPca: d.anoPca ?? d.protocoloAnoPca,
      regras,
      categoria: classificarAssunto(d.protocoloAssunto),
      orgaos,
    });
    const linha: ConfLinha = { id: d.id, estado: r.estado, resumo: r.resumo ?? null, validacao: r.validacao };
    gravar.push({ alvoId: d.id, assinatura, resultado: JSON.stringify(linha) });
    return linha;
  });
  await gravarGuardadas("dfd", gravar);
  return ok({ linhas });
}
