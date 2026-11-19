/**
 * Os AJUSTES da Automação de cada ADM (a emissão do DFD e o órgão na Centi) — guardados NO SISTEMA (`preferencias_tabela`,
 * chave `PREF_AJUSTES_CENTI`), não mais no aparelho: valem em qualquer navegador e são os MESMOS na tela Automação →
 * Ajustes e no banner da extensão. Núcleo puro (testado — `tests/automacao-ajustes.test.ts`).
 */
export const PREF_AJUSTES_CENTI = "automacao:ajustes-centi";
/** O máximo de órgãos no mapa órgão → ID da Centi (o mapa vai inteiro numa linha de preferência). */
export const MAX_MAPA_ENTIDADES = 300;
const ENTIDADE = /^[\w.-]{1,40}$/;
const CHAVE_ORGAO = /^[ot]:[^\s].{0,79}$/;

export type AjustesCenti = {
  /** "Emitir valor referência" do diálogo da Centi (Baixar/anexar DFDs). */
  valorReferencia: boolean;
  /** "Emitir data" do diálogo. */
  emitirData: boolean;
  /** Descobrir sozinho a entidade (órgão) da Centi do DFD sem o ID cadastrado. */
  descobrirEntidade: boolean;
  /** As entidades a tentar ("02:03:04"); vazio = de 0 a 28 no formato da aberta. */
  entidades: string;
  /** Órgão (`chaveOrgaoCenti`) → ID da entidade na Centi, para os órgãos SEM o ID cadastrado. */
  mapa: Record<string, string>;
};

export const AJUSTES_PADRAO: AjustesCenti = { valorReferencia: true, emitirData: false, descobrirEntidade: true, entidades: "", mapa: {} };

/** O mapa limpo: só chaves de órgão válidas e IDs de entidade válidos, até `MAX_MAPA_ENTIDADES`. */
export function lerMapaEntidades(v: unknown): Record<string, string> {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const r: Record<string, string> = {};
  for (const [k, x] of Object.entries(o)) {
    if (Object.keys(r).length >= MAX_MAPA_ENTIDADES) break;
    if (CHAVE_ORGAO.test(k) && typeof x === "string" && ENTIDADE.test(x.trim())) r[k] = x.trim();
  }
  return r;
}

/** Qualquer JSON → os ajustes válidos (o que faltar ou vier errado = o padrão). */
export function lerAjustesCenti(v: unknown): AjustesCenti {
  const o = (v && typeof v === "object" ? v : {}) as Partial<Record<keyof AjustesCenti, unknown>>;
  const p = AJUSTES_PADRAO;
  return {
    valorReferencia: typeof o.valorReferencia === "boolean" ? o.valorReferencia : p.valorReferencia,
    emitirData: typeof o.emitirData === "boolean" ? o.emitirData : p.emitirData,
    descobrirEntidade: typeof o.descobrirEntidade === "boolean" ? o.descobrirEntidade : p.descobrirEntidade,
    entidades: typeof o.entidades === "string" ? o.entidades.slice(0, 300) : p.entidades,
    mapa: lerMapaEntidades(o.mapa),
  };
}

export type MudancaAjustes = {
  ajustes?: Partial<Omit<AjustesCenti, "mapa">> & { mapa?: Record<string, string> };
  /** UM órgão do mapa: `entidade` vazia = tira. */
  entidade?: { orgao: string; entidade: string };
};

/** Aplica a mudança (parcial) sobre os ajustes atuais — o mapa inteiro só quando vier inteiro (a migração do aparelho). */
export function aplicarAjustes(antes: AjustesCenti, m: MudancaAjustes): AjustesCenti {
  const base = lerAjustesCenti({ ...antes, ...(m.ajustes ?? {}), mapa: m.ajustes?.mapa ?? antes.mapa });
  if (!m.entidade) return base;
  const mapa = { ...base.mapa };
  const v = m.entidade.entidade.trim();
  if (v && ENTIDADE.test(v)) mapa[m.entidade.orgao] = v;
  else delete mapa[m.entidade.orgao];
  return { ...base, mapa: lerMapaEntidades(mapa) };
}

/** O que mudou, em texto (a auditoria). */
export function textoMudancaAjustes(antes: AjustesCenti, depois: AjustesCenti): string[] {
  const p: string[] = [];
  if (antes.valorReferencia !== depois.valorReferencia) p.push(`Emitir valor de referência: ${depois.valorReferencia ? "sim" : "não"}`);
  if (antes.emitirData !== depois.emitirData) p.push(`Emitir data: ${depois.emitirData ? "sim" : "não"}`);
  if (antes.descobrirEntidade !== depois.descobrirEntidade) p.push(`Descobrir o órgão sozinho: ${depois.descobrirEntidade ? "sim" : "não"}`);
  if (antes.entidades !== depois.entidades) p.push(`IDs de órgão a tentar: ${depois.entidades || "0 a 28"}`);
  if (JSON.stringify(antes.mapa) !== JSON.stringify(depois.mapa)) p.push(`Órgãos com ID na Centi: ${Object.keys(depois.mapa).length}`);
  return p;
}
