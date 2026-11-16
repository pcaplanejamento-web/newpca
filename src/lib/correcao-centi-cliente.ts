/**
 * CORRIGIR UM DFD PELA CENTI (navegador): a MESMA correção do "Usar a Centi em…" da Mesa, usada também pela automação
 * "Corrigir DFDs divergentes pela Centi". Lê do SERVIDOR o DFD (com o status, o motivo e o aceite da conferência ATUAIS) e
 * o RETRATO da Centi guardado na conferência; só corrige o DIVERGENTE não aceito, nos tipos que a Centi corrige; grava SÓ
 * o que mudou (`diffDfdGravado`) com a trava `atualizadoEmLido` e refaz a conferência pelo retrato. Nº do DFD, planejamento,
 * assinaturas, unidade, protocolo e PCA nunca mudam (`novoDaCenti`). `fetch` injetável (testado).
 */
import { aceiteVale, lerAceite, MSG_RETRATO_VENCIDO, type RetratoCenti, retratoDoPlanejamento, tiposDoMotivo } from "./conferencia-dfd-centi.ts";
import { aplicarCentiPorTipos, planoCorrecao, tiposCorrigiveisDoMotivo } from "./correcao-centi-core.ts";
import type { DfdDetalhe } from "./dfd.ts";
import { detalheParaParseado, diffDfdGravado } from "./dfd-edicao.ts";
import { semMarcas } from "./sobrescrita-dfd.ts";

export type ResultadoCorrecao = {
  /** corrigido = gravado com os dados da Centi · sem = nada a corrigir nos tipos · aceito = divergência aceita (com ressalva)
   * · convergente = já não diverge · naoCorrigivel = só divergências que a Centi não corrige (situação, órgão, nº)
   * · parcial = gravou, mas a reconferência AINDA diverge (`restam` diz em quê)
   * · pendente = gravou, mas a reconferência falhou (sem confirmação — execute de novo). */
  resultado: "corrigido" | "parcial" | "pendente" | "sem" | "aceito" | "convergente" | "naoCorrigivel";
  /** O status da conferência DEPOIS (o do `recalcular` quando gravou; senão o atual). */
  status: string | null;
  motivo: string | null;
  /** Os tipos que ainda divergem depois de gravar (só no `parcial`). */
  restam?: string[];
};

/** O que a Centi NÃO corrige no DFD (identidade/situação, ou nada lido): a automação desiste só com eles. */
const SEM_CORRECAO: ReadonlySet<string> = new Set(["Situação", "Órgão", "Nº do DFD", "Não encontrado na Centi"]);

type Busca = (url: string, init?: RequestInit) => Promise<Response>;

async function lerJson<T>(r: Response): Promise<T & { ok?: boolean; error?: string }> {
  return ((await r.json().catch(() => ({}))) ?? {}) as T & { ok?: boolean; error?: string };
}

/**
 * Corrige UM DFD pela Centi. `tipos` = só esses tipos de divergência (a massa da Mesa); `null` = todos os que a Centi
 * corrige no motivo ATUAL (a automação). Lança com o motivo quando não pode gravar (o DFD fica como estava).
 */
export async function corrigirDfdPelaCenti(id: number, tipos: readonly string[] | null, busca: Busca = fetch): Promise<ResultadoCorrecao> {
  if (!Number.isInteger(id) || id <= 0) throw new Error("DFD sem id.");
  const r1 = await busca(`/api/dfd/${id}`);
  const j1 = await lerJson<{ dfd?: DfdDetalhe }>(r1);
  if (!r1.ok || !j1.ok || !j1.dfd) throw new Error(j1.error ?? "não foi possível ler o DFD");
  const o = j1.dfd;
  const status = o.conferenciaCenti ?? null;
  const motivo = o.conferenciaCentiMotivo ?? null;
  // A decisão é do SERVIDOR (o gravado AGORA), nunca do que o item diz.
  if (status !== "divergente") return { resultado: "convergente", status, motivo };
  if (aceiteVale(status, motivo, lerAceite(o.conferenciaCentiAceite))) return { resultado: "aceito", status, motivo };
  const alcance = tiposCorrigiveisDoMotivo(tiposDoMotivo(motivo));
  // O motivo tem teto ("e mais N"): cortado, os tipos que ficaram fora do texto também contam (decide o retrato).
  const cortado = /(^|\n)e mais \d+\s*$/.test(String(motivo ?? ""));
  const usar = tipos ? alcance.filter((t) => tipos.includes(t)) : alcance;
  // A automação (`tipos` null): só desiste quando o motivo tem SÓ o que a Centi não corrige de fato ("Outras" = linha não
  // classificada — o retrato decide). A massa usa a régua de sempre.
  const desiste = tipos ? !alcance.length : tiposDoMotivo(motivo).every((t) => SEM_CORRECAO.has(t));
  if (desiste && !cortado) return { resultado: "naoCorrigivel", status, motivo };
  if (tipos && !usar.length) return { resultado: "sem", status, motivo };
  const r2 = await busca(`/api/dfd/${id}/conferencia-centi?retrato=1`);
  const j2 = await lerJson<{ retrato?: RetratoCenti | null; vencido?: boolean }>(r2);
  if (!r2.ok || !j2.ok) throw new Error(j2.error ?? "não foi possível ler os dados da Centi");
  if (j2.vencido) throw new Error(MSG_RETRATO_VENCIDO);
  const retrato = retratoDoPlanejamento(j2.retrato?.v === 3 ? j2.retrato : null, o.planejamento);
  if (!retrato) throw new Error("sem os dados da Centi CONFIRMADOS (dupla leitura no próprio órgão) — reconfira o DFD na Centi e execute de novo");
  const g = detalheParaParseado(o);
  const plano = planoCorrecao(g, retrato, o.anoPca ?? o.protocoloAnoPca ?? null);
  // A automação (`tipos` null) corrige TODA divergência do retrato — não só as que couberam no motivo gravado.
  const corrigido = semMarcas(aplicarCentiPorTipos(g, plano, tipos ? usar : null));
  const itensMudaram = JSON.stringify(corrigido.itens) !== JSON.stringify(g.itens);
  if (itensMudaram && corrigido.itens.length === 0) throw new Error("a Centi não tem itens — corrija no banner do DFD");
  const body = diffDfdGravado(o, corrigido, o.reparticaoId, itensMudaram);
  if (!Object.keys(body).length) return { resultado: "sem", status, motivo };
  const r3 = await busca(`/api/dfd/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, atualizadoEmLido: o.atualizadoEm ?? undefined, origem: "centi" }),
  });
  const j3 = await lerJson<object>(r3);
  if (!r3.ok || !j3.ok) throw new Error(j3.error ?? `não foi possível gravar (HTTP ${r3.status})`);
  // Gravado: refaz a conferência pelo retrato (a falha aqui não desfaz a correção — o selo fica "Reconferir").
  try {
    const r4 = await busca(`/api/dfd/${id}/conferencia-centi`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ acao: "recalcular" }),
    });
    const j4 = await lerJson<{ status?: string; motivo?: string | null }>(r4);
    if (r4.ok && j4.ok) {
      const depois = j4.status ?? null;
      if (depois === "divergente") return { resultado: "parcial", status: depois, motivo: j4.motivo ?? null, restam: tiposDoMotivo(j4.motivo) };
      return { resultado: "corrigido", status: depois, motivo: j4.motivo ?? null };
    }
  } catch {
    /* segue: a correção foi gravada */
  }
  return { resultado: "pendente", status: null, motivo: null };
}
