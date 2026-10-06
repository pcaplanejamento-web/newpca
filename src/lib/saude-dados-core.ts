import { classificarAssunto, type RegrasAvaliacao } from "./avaliacao-core.ts";
import { somatorioProcesso } from "./conferencia-dfd.ts";
import { conciliacaoCapa } from "./dfd-tratamento.ts";
import { brl, num } from "./format.ts";
import { arredondarValor } from "./parse-dfd-comum.ts";
import type { DfdSaude, EntradaSaude } from "./saude-dados-sql.ts";

/**
 * SAÚDE DOS DADOS — a classificação PURA do que as consultas (`saude-dados-sql.ts`) leram. Dois grupos:
 *
 * - **Integridade** (deve ser ZERO — vermelho): DFD × itens, protocolo × DFDs × itens (as abas da Mesa), numeração e
 *   vínculos do PCA, rastro em dobro e Id repetido. Qualquer ocorrência é um defeito do sistema, não dos dados.
 * - **Dados a tratar** (âmbar): gravação incompleta, capa × somatória (a MESMA régua da Mesa — `somatorioProcesso` +
 *   `conciliacaoCapa` com as regras do ADM), itens sem valor unitário e DFD sem nº de planejamento.
 *
 * Cada linha leva o link do protocolo (o da Mesa em que ele está — `linkProtocolo`, injetado) ou, no DFD avulso, o do DFD.
 */

export type NivelSaude = "ok" | "atencao" | "alerta";
export type GrupoSaude = "integridade" | "dados";
export type ChaveSaude = "dfd-itens" | "abas" | "pca" | "rastro" | "incompleta" | "capa" | "sem-valor" | "sem-planejamento";

export type LinhaSaude = {
  chave: string;
  protocolo: string | null;
  dfd: string | null;
  planejamento: string | null;
  problema: string;
  /** Onde tratar (a Mesa com o protocolo ou o DFD aberto); `null` = sem destino (as estruturais). */
  href: string | null;
};

export type VerificacaoSaude = {
  chave: ChaveSaude;
  titulo: string;
  descricao: string;
  grupo: GrupoSaude;
  nivel: NivelSaude;
  /** Quantas ocorrências (exato). */
  total: number;
  /** O que o total conta, no plural ("DFDs", "itens"…). */
  unidade: string;
  linhas: LinhaSaude[];
  /** A lista mostra só parte (o teto das consultas). */
  parcial: boolean;
};

export type SaudeDados = {
  verificadoEm: string;
  contagens: { protocolos: number; dfds: number; itens: number; numerosPca: number };
  verificacoes: VerificacaoSaude[];
};

export type LinkProtocolo = (p: { id: number; pcaId?: number | null }) => string;

/** Centavos como a TELA mostra (`brl` fixa as 4 casas antes): duas somas do mesmo valor em ordens diferentes = o mesmo. */
const centavos = (v: number) => Math.round(arredondarValor(v) * 100);
const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

/** A linha de um DFD: o protocolo dele (com o link da Mesa em que está) ou o próprio DFD, se avulso. */
function linhaDfd(d: DfdSaude, problema: string, link: LinkProtocolo, prefixo: string): LinhaSaude {
  return {
    chave: `${prefixo}:${d.id}`,
    protocolo: d.protocolo,
    dfd: d.numero,
    planejamento: d.planejamento?.trim() || null,
    problema,
    href: d.protocoloId != null ? link({ id: d.protocoloId, pcaId: d.pcaId }) : `/painel/mesa?abrir=dfd:${d.id}`,
  };
}

/** As ESTRUTURAIS viram uma linha por contagem diferente de zero (sem destino: é defeito do sistema). */
function linhasDeContagem(prefixo: string, itens: Array<[string, number]>): LinhaSaude[] {
  return itens
    .filter(([, n]) => n > 0)
    .map(([texto, n]) => ({ chave: `${prefixo}:${texto}`, protocolo: null, dfd: null, planejamento: null, problema: `${texto}: ${num(n)}`, href: null }));
}

function verificacao(
  v: Omit<VerificacaoSaude, "nivel" | "parcial"> & { parcial?: boolean },
): VerificacaoSaude {
  const nivel: NivelSaude = v.total === 0 ? "ok" : v.grupo === "integridade" ? "alerta" : "atencao";
  return { ...v, nivel, parcial: v.parcial ?? false };
}

export function avaliarSaude(e: EntradaSaude, regras: RegrasAvaliacao, link: LinkProtocolo, agora: Date): SaudeDados {
  const c = e.contagens;

  // 1. DFD × itens (completos) — o valor e o nº de itens de cada DFD = os itens gravados.
  const divergentes = e.dfds.filter((d) => !d.parcial);
  const linhasDfdItens = divergentes.map((d) => {
    const partes: string[] = [];
    if ((d.declarados ?? 0) !== d.itens) partes.push(`${num(d.itens)} itens gravados × ${num(d.declarados ?? 0)} no DFD`);
    if (centavos(d.valor ?? 0) !== centavos(d.somaItens) || Math.abs((d.valor ?? 0) - d.somaItens) >= 0.00005)
      partes.push(`valor ${brl(d.valor ?? 0)} × itens ${brl(d.somaItens)}`);
    return linhaDfd(d, partes.join("; ") || "Totais diferentes dos itens", link, "dfd-itens");
  });

  // 2. Protocolo × DFDs × itens — sem os protocolos com DFD pela metade (gravação incompleta) ou já apontado acima.
  const comDfdDivergente = new Set(divergentes.map((d) => d.protocoloId).filter((id): id is number => id != null));
  const abas = e.protocolos.filter((p) => p.dfds > 0 && !p.parciais && !comDfdDivergente.has(p.id) && centavos(p.somaDfds) !== centavos(p.somaItens));
  const linhasAbas: LinhaSaude[] = abas.map((p) => ({
    chave: `abas:${p.id}`,
    protocolo: p.numero,
    dfd: null,
    planejamento: null,
    problema: `DFDs ${brl(p.somaDfds)} × itens ${brl(p.somaItens)}`,
    href: link({ id: p.id, pcaId: p.pcaId }),
  }));

  // 3. Numeração e vínculos do PCA.
  const pca: Array<[string, number]> = [
    ["Nº ativo de DFD que não está mais no PCA", c.pcaAtivoSemVinculo],
    ["Nº vivo sem item em DFD completo", c.pcaNumeroSemItem],
    ["Item incorporado sem nº no PCA", c.pcaItemSemNumero],
    ["Item com nº diferente da numeração do PCA", c.pcaNumeroDivergente],
    ["Item com dois nºs vivos", c.pcaItemDoisNumeros],
    ["Vínculo do PCA fora do protocolo incorporado", c.pcaVinculoForaDoProtocolo],
    ["DFD de protocolo incorporado fora do PCA", c.pcaIncorporadoSemVinculo],
  ];

  // 4. Rastro e Id.
  const rastro: Array<[string, number]> = [
    ["DFD contado no rastro e vivo no mesmo protocolo", c.rastroEmDobro],
    ["Id de protocolo repetido", c.idsRepetidos],
  ];

  // 6. Capa × somatória — a MESMA régua da célula Estado da Mesa.
  const linhasCapa: LinhaSaude[] = [];
  for (const p of e.protocolos) {
    const proc = somatorioProcesso({ valorTotal: p.somaDfds, totalDfds: p.dfds, sobrescritos: p.rastro, valorSobrescritos: p.somaRastro });
    const conc = conciliacaoCapa({ valorCapa: p.valorCapa, somatorio: proc.exato, totalDfds: proc.dfds }, regras, { categoria: classificarAssunto(p.assunto) });
    if (!conc.ativa || !conc.divergente) continue;
    linhasCapa.push({
      chave: `capa:${p.id}`,
      protocolo: p.numero,
      dfd: null,
      planejamento: null,
      problema: conc.zerada ? `Capa sem valor · somatória ${brl(conc.somatorio)}` : `Capa ${brl(p.valorCapa ?? 0)} × somatória ${brl(conc.somatorio)}`,
      href: link({ id: p.id, pcaId: p.pcaId }),
    });
  }

  const parciais = e.dfds.filter((d) => d.parcial);
  const verificacoes: VerificacaoSaude[] = [
    verificacao({
      chave: "dfd-itens",
      titulo: "DFD × itens",
      descricao: "O valor e o nº de itens de cada DFD completo são os dos itens gravados.",
      grupo: "integridade",
      total: c.dfdsDivergentes,
      unidade: "DFDs",
      linhas: linhasDfdItens,
      parcial: linhasDfdItens.length < c.dfdsDivergentes,
    }),
    verificacao({
      chave: "abas",
      titulo: "Protocolo × DFDs × itens",
      descricao: "A soma dos DFDs de cada protocolo é a soma dos itens: as abas da Mesa mostram o mesmo centavo.",
      grupo: "integridade",
      total: linhasAbas.length,
      unidade: "protocolos",
      linhas: linhasAbas,
    }),
    verificacao({
      chave: "pca",
      titulo: "Numeração e vínculos do PCA",
      descricao: `Cada item incorporado tem um nº vivo e só os DFDs dos protocolos incorporados estão no PCA (${num(c.numerosPca)} nºs conferidos).`,
      grupo: "integridade",
      total: pca.reduce((s, [, n]) => s + n, 0),
      unidade: "ocorrências",
      linhas: linhasDeContagem("pca", pca),
    }),
    verificacao({
      chave: "rastro",
      titulo: "Rastro e Id do protocolo",
      descricao: "Nenhum DFD contado em dobro na somatória da capa e nenhum Id de protocolo repetido.",
      grupo: "integridade",
      total: rastro.reduce((s, [, n]) => s + n, 0),
      unidade: "ocorrências",
      linhas: linhasDeContagem("rastro", rastro),
    }),
    verificacao({
      chave: "incompleta",
      titulo: "Gravação incompleta",
      descricao: "DFDs com menos itens gravados que os do documento — reenvie o protocolo (ou o DFD) para completar.",
      grupo: "dados",
      total: c.dfdsParciais,
      unidade: "DFDs",
      linhas: parciais.map((d) =>
        linhaDfd(d, `${num(d.itens)} de ${num(d.declarados ?? 0)} itens gravados`, link, "incompleta"),
      ),
      parcial: parciais.length < c.dfdsParciais,
    }),
    verificacao({
      chave: "capa",
      titulo: "Capa × somatória",
      descricao: "O valor da capa ausente ou diferente da soma dos DFDs — a mesma régua da Mesa.",
      grupo: "dados",
      total: linhasCapa.length,
      unidade: "protocolos",
      linhas: linhasCapa,
    }),
    verificacao({
      chave: "sem-valor",
      titulo: "Itens sem valor unitário",
      descricao: `Itens sem valor unitário (vazio, zero ou negativo) em ${num(c.dfdsSemValor)} ${plural(c.dfdsSemValor, "DFD", "DFDs")}: o valor do DFD fica incompleto.`,
      grupo: "dados",
      total: c.itensSemValor,
      unidade: "itens",
      linhas: e.semValor.map((d) =>
        linhaDfd(d, `${num(d.itens)} ${plural(d.itens, "item", "itens")} sem valor unitário (de ${num(d.declarados ?? d.itens)})`, link, "sem-valor"),
      ),
      parcial: e.semValor.length < c.dfdsSemValor,
    }),
    verificacao({
      chave: "sem-planejamento",
      titulo: "DFD sem nº de planejamento",
      descricao: "O nº de planejamento identifica o DFD no Centi: corrija lá e reenvie.",
      grupo: "dados",
      total: c.semPlanejamento,
      unidade: "DFDs",
      linhas: e.semPlanejamento.map((d) => linhaDfd(d, "Sem nº de planejamento", link, "sem-planejamento")),
      parcial: e.semPlanejamento.length < c.semPlanejamento,
    }),
  ];

  return {
    verificadoEm: agora.toISOString(),
    contagens: { protocolos: c.protocolos, dfds: c.dfds, itens: c.itens, numerosPca: c.numerosPca },
    verificacoes,
  };
}

