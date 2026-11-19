import { exigirAdmin } from "@/lib/api-auth";
import { aplicarAjustes, textoMudancaAjustes } from "@/lib/automacao-ajustes-core";
import { gravarAjustes, lerAjustes, operacaoEmUso, orgaosDaAutomacao } from "@/lib/automacao-ajustes";
import { ORIGEM_EXTENSAO_CENTI, VERSAO_EXTENSAO_CENTI } from "@/lib/automacao-centi-core";
import { registrarAuditoria } from "@/lib/auditoria";
import { coerceConfigAutomacao } from "@/lib/automacao-core";
import { getConfigAutomacao, gravarConfigAutomacao } from "@/lib/automacao-plataforma";
import { ajustesCentiPatchSchema } from "@/lib/automacao-validation";
import { pedidoDaExtensao } from "@/lib/centi-login-core";
import { erro, ok } from "@/lib/http";
import { origemPermitida } from "@/lib/origem";

export const dynamic = "force-dynamic";

/**
 * Os AJUSTES da Automação — a FONTE ÚNICA da tela Automação → Ajustes e do BANNER da extensão: a emissão do DFD e o órgão
 * na Centi (de cada ADM, no sistema), a Gravação na Centi e a operação Emitir DFD (de todos). `?orgaos=1` traz também os
 * órgãos dos DFDs (o banner; a tela já os tem).
 */
async function estado(usuarioId: number, comOrgaos: boolean) {
  const [{ ajustes, salvo }, op, orgaos] = await Promise.all([lerAjustes(usuarioId), operacaoEmUso(), comOrgaos ? orgaosDaAutomacao() : null]);
  return {
    ajustes,
    salvo,
    gravacao: op.ativa,
    operacao: { moduleKey: op.moduleKey, guid: op.guid },
    ...(orgaos ? { orgaos } : {}),
    extensao: VERSAO_EXTENSAO_CENTI,
  };
}
const semCache = (r: Response) => {
  r.headers.set("cache-control", "no-store");
  return r;
};

export async function GET(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  return semCache(ok(await estado(g.u.id, new URL(req.url).searchParams.get("orgaos") === "1")));
}

/** Pela TELA (o próprio site) ou pelo BANNER da extensão (o `Origin` dela) — página de outro site, nunca. */
export async function PATCH(req: Request) {
  const daTela = !!req.headers.get("origin") && origemPermitida(req);
  if (!daTela && !pedidoDaExtensao(req.method, req.headers.get("origin"), req.headers.get("sec-fetch-site"), ORIGEM_EXTENSAO_CENTI))
    return erro("Origem não permitida.", 403);
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const p = ajustesCentiPatchSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return erro(p.error.issues[0]?.message ?? "Dados inválidos.", 422);
  const partes: string[] = [];
  if (p.data.ajustes || p.data.entidade) {
    const { ajustes: antes } = await lerAjustes(g.u.id);
    const depois = aplicarAjustes(antes, { ajustes: p.data.ajustes, entidade: p.data.entidade });
    await gravarAjustes(g.u.id, depois);
    partes.push(...textoMudancaAjustes(antes, depois));
  }
  if (p.data.gravacao !== undefined || p.data.operacao) {
    const antes = await getConfigAutomacao();
    const depois = coerceConfigAutomacao({
      ...antes,
      ...(p.data.gravacao === undefined ? {} : { ativa: p.data.gravacao }),
      operacao: p.data.operacao ? { ...p.data.operacao, em: new Date().toISOString() } : antes.operacao,
    });
    await gravarConfigAutomacao(depois, g.u.id);
    if (antes.ativa !== depois.ativa) partes.push(depois.ativa ? "Automação RETOMADA" : "Automação PAUSADA (freio de emergência)");
    if (p.data.operacao && (antes.operacao?.moduleKey !== depois.operacao?.moduleKey || antes.operacao?.guid !== depois.operacao?.guid))
      partes.push(`Operação Emitir DFD: ModuleKey ${depois.operacao?.moduleKey}`);
  }
  if (partes.length)
    await registrarAuditoria({
      usuario: g.u,
      acao: "editar",
      entidade: "automacao",
      origem: "centi",
      resumo: `Ajustes da Automação${daTela ? "" : " (pela extensão)"}: ${partes.join(" · ")}`,
    });
  return semCache(ok(await estado(g.u.id, false)));
}
