import type { LinhaHistorico } from "./auditoria-core.ts";
import { mascararTexto, SENSIVEL } from "./dados-pessoais-core.ts";
import type { VisaoMesa } from "./mesa-visao-core.ts";
import type { NivelHistorico } from "./papeis-detalhes-core.ts";

/**
 * REDAÇÃO DO HISTÓRICO — núcleo PURO (testado): o que a pessoa não vê não sai pelo histórico. A mesma régua na consulta
 * PÚBLICA do PCA (`REGRA_PUBLICA`) e nos papéis com detalhes (`regraHistoricoMesa`): sem os autores, sem os campos
 * ocultos (pela CHAVE — o "responsavel" do formulário do DFD não é o Responsável da Mesa, `responsavelId`) e sem os
 * dados pessoais. A linha cujas mudanças eram TODAS de campos ocultos some (ex.: só o Responsável trocado na célula).
 */
export type RegraHistorico = {
  /** Sem o autor (`usuarioId`/`usuarioNome`). */
  anonimo: boolean;
  /** As CHAVES de campo que não saem (formato novo `detalhe.campos` e o legado `antes`/`depois`). */
  camposOcultos: ReadonlySet<string>;
  /** Sem os dados pessoais: chaves/rótulos `SENSIVEL`, as assinaturas e a máscara no texto. */
  semPessoais: boolean;
};

export const REGRA_COMPLETA: RegraHistorico = Object.freeze({ anonimo: false, camposOcultos: new Set<string>(), semPessoais: false });

/** A consulta PÚBLICA do PCA: sem autor, sem dados pessoais, sem Responsável nem Situação (gestão interna). */
export const REGRA_PUBLICA: RegraHistorico = Object.freeze({ anonimo: true, camposOcultos: new Set(["responsavelId", "situacaoId"]), semPessoais: true });

/** A régua do histórico da Mesa para a VISÃO do papel (o nível "sem autores" anonimiza). */
export function regraHistoricoMesa(vis: VisaoMesa, nivel: NivelHistorico = "completo"): RegraHistorico {
  const ocultos = new Set<string>();
  if (!vis.responsavel.ver) ocultos.add("responsavelId");
  if (vis.colunasOcultas.protocolos.includes("situacao")) ocultos.add("situacaoId");
  return { anonimo: nivel === "anonimo", camposOcultos: ocultos, semPessoais: vis.dadosPessoais === "mascarar" };
}

const semRestricao = (r: RegraHistorico) => !r.anonimo && r.camposOcultos.size === 0 && !r.semPessoais;
const ocultaChave = (r: RegraHistorico, chave: string, rotulo = "") => r.camposOcultos.has(chave) || (r.semPessoais && (SENSIVEL.test(chave) || SENSIVEL.test(rotulo)));

type Redigido = { json: string | null; havia: boolean; ficou: boolean; tirou: boolean };

/** O JSON legado (`antes`/`depois` por chave): sem as chaves ocultas. */
function redigirJson(bruto: string | null, r: RegraHistorico): Redigido {
  if (!bruto) return { json: bruto, havia: false, ficou: false, tirou: false };
  const texto = r.semPessoais ? mascararTexto(bruto) : bruto;
  try {
    const o: unknown = JSON.parse(texto);
    if (!o || typeof o !== "object" || Array.isArray(o)) return { json: texto, havia: true, ficou: true, tirou: false };
    const entradas = Object.entries(o as Record<string, unknown>);
    const ficam = entradas.filter(([k]) => !ocultaChave(r, k));
    return { json: JSON.stringify(Object.fromEntries(ficam)), havia: entradas.length > 0, ficou: ficam.length > 0, tirou: ficam.length < entradas.length };
  } catch {
    return { json: r.semPessoais ? null : texto, havia: true, ficou: !r.semPessoais, tirou: r.semPessoais };
  }
}

/** O `detalhe` (formato novo): sem os campos ocultos (e, sem dados pessoais, sem as assinaturas). */
function redigirDetalhe(bruto: string | null, r: RegraHistorico): Redigido {
  if (!bruto) return { json: bruto, havia: false, ficou: false, tirou: false };
  const texto = r.semPessoais ? mascararTexto(bruto) : bruto;
  try {
    const d = JSON.parse(texto) as { campos?: { campo: string; rotulo: string }[]; secoes?: unknown[]; assinaturas?: unknown; itens?: unknown[]; [k: string]: unknown };
    const campos = d.campos ?? [];
    const ficam = campos.filter((c) => !ocultaChave(r, c.campo, c.rotulo));
    const semAss = r.semPessoais && d.assinaturas != null;
    const { assinaturas, ...resto } = d;
    const novo = { ...resto, ...(semAss ? {} : assinaturas !== undefined ? { assinaturas } : {}), campos: ficam };
    const outros = (d.secoes?.length ?? 0) > 0 || (d.itens?.length ?? 0) > 0 || (!semAss && d.assinaturas != null);
    return {
      json: JSON.stringify(novo),
      havia: campos.length > 0 || outros || semAss,
      ficou: ficam.length > 0 || outros,
      tirou: ficam.length < campos.length || semAss,
    };
  } catch {
    return { json: r.semPessoais ? null : texto, havia: true, ficou: !r.semPessoais, tirou: r.semPessoais };
  }
}

/** Uma linha redigida — `null` quando TODAS as mudanças dela eram de campos ocultos. */
function redigirLinha(l: LinhaHistorico, r: RegraHistorico): LinhaHistorico | null {
  const detalhe = redigirDetalhe(l.detalhe, r);
  const antes = redigirJson(l.antes, r);
  const depois = redigirJson(l.depois, r);
  const partes = [detalhe, antes, depois];
  const tirou = partes.some((p) => p.tirou);
  // Havia mudanças e todas saíram: a linha não diz mais nada (e dizer que "algo" mudou já revelaria o campo).
  if (tirou && partes.some((p) => p.havia) && !partes.some((p) => p.ficou)) return null;
  return {
    ...l,
    usuarioId: r.anonimo ? null : l.usuarioId,
    usuarioNome: r.anonimo ? null : l.usuarioNome,
    // O resumo legível pode citar o que saiu: some (a tela refaz o resumo pelo que ficou no detalhe).
    resumo: tirou && !r.semPessoais ? null : r.semPessoais ? mascararTexto(l.resumo) : l.resumo,
    antes: antes.json,
    depois: depois.json,
    detalhe: detalhe.json,
  };
}

/** O histórico como a pessoa o vê (sem restrição, a MESMA lista). */
export function redigirHistorico(linhas: LinhaHistorico[], r: RegraHistorico): LinhaHistorico[] {
  if (semRestricao(r)) return linhas;
  const out: LinhaHistorico[] = [];
  for (const l of linhas) {
    const x = redigirLinha(l, r);
    if (x) out.push(x);
  }
  return out;
}
