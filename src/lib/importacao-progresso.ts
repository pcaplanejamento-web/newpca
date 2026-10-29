import { diasDoPeriodo, type Periodo, periodoDoAno } from "./empenhos-core.ts";

/**
 * O ANDAMENTO AO VIVO de uma importação conduzida pelo navegador (puro, testado): cada PEDIDO à Centi (um período × página
 * ou órgão) passa por FASES — na fila · pedindo · baixando (os bytes que chegam; com o tamanho esperado, a fração exata) ·
 * lendo (o JSON) · comparando (com o que já está gravado) · gravando (as partes) · concluído — e a importação inteira por
 * ETAPAS — preparando · assinaturas · leitura · conclusão (conferência + gravação no banco). A fração geral é a MESMA régua
 * do "ano lido" (`fracaoDoAno`, pelos dias) com o que cada pedido em curso já fez, então nunca contradiz a tabela dos passos.
 */

export type FasePedido = "fila" | "pedindo" | "baixando" | "lendo" | "comparando" | "gravando" | "concluido" | "dividido" | "esperando" | "erro";

export type PedidoAndamento = {
  chave: string;
  periodo: Periodo;
  pagina: number;
  /** "órgão 12" (liquidações e pagamentos) ou "página 2" (empenhos). */
  rotuloPagina: string;
  fase: FasePedido;
  tentativa: number;
  /** Quando o pedido começou (ms, relógio do navegador) e quando a fase atual começou. */
  inicioMs: number;
  faseMs: number;
  fimMs?: number;
  bytes: number;
  /** O tamanho da resposta: o informado pela Centi ou o da última importação do mesmo pedido; null = desconhecido. */
  bytesEsperados: number | null;
  /** Os registros da página (depois de ler o JSON) e o que a comparação separou. */
  registros: number | null;
  iguais: number | null;
  mudaram: number | null;
  partes: number;
  partesFeitas: number;
  /** A espera até a nova tentativa (ms) e a mensagem da falha. */
  espera?: number;
  mensagem?: string;
  /** O resultado da conferência no banco (a última parte). */
  novos?: number | null;
  alterados?: number | null;
  semVinculo?: number | null;
};

export type EtapaImportacao = "preparando" | "assinaturas" | "leitura" | "conclusao" | "fim";
export const ORDEM_ETAPAS: readonly EtapaImportacao[] = ["preparando", "assinaturas", "leitura", "conclusao"];
export const ROTULO_ETAPA: Record<EtapaImportacao, string> = {
  preparando: "Preparando a importação",
  assinaturas: "Lendo o que já está gravado",
  leitura: "Lendo a Centi",
  conclusao: "Conferindo e gravando no banco",
  fim: "Concluída",
};

/** A faixa de cada etapa na barra geral (a leitura é quase tudo; a conclusão é UM pedido ao servidor). */
const FAIXA: Record<EtapaImportacao, [number, number]> = {
  preparando: [0, 0.01],
  assinaturas: [0.01, 0.04],
  leitura: [0.04, 0.94],
  conclusao: [0.94, 0.995],
  fim: [1, 1],
};

/** Até onde vai o download sem o tamanho esperado: a curva se aproxima de 90% da fase (nunca para nem passa). */
const REF_SEM_TAMANHO = 4 * 1024 * 1024;

/** A fração de UM pedido (0..1) pela fase: baixar vale ~55%, ler e comparar ~7%, gravar as partes o resto. */
export function fracaoDoPedido(p: Pick<PedidoAndamento, "fase" | "bytes" | "bytesEsperados" | "partes" | "partesFeitas">): number {
  switch (p.fase) {
    case "fila":
      return 0;
    case "pedindo":
      return 0.02;
    case "baixando": {
      const b = p.bytesEsperados && p.bytesEsperados > 0 ? Math.min(1, p.bytes / p.bytesEsperados) : 0.9 * (1 - Math.exp(-p.bytes / REF_SEM_TAMANHO));
      return 0.02 + 0.53 * b;
    }
    case "lendo":
      return 0.57;
    case "comparando":
      return 0.62;
    case "gravando":
      return 0.62 + 0.37 * (p.partes > 0 ? Math.min(1, p.partesFeitas / p.partes) : 0);
    case "concluido":
    case "dividido":
      return 1;
    default:
      // Esperando a nova tentativa / erro: o pedido recomeça do zero.
      return 0;
  }
}

/**
 * A fração da LEITURA do ano (0..1): os dias dos períodos já concluídos (a régua do `fracaoDoAno`) + cada pedido em curso na
 * proporção dos dias dele (dividido pelos órgãos quando o período é lido órgão a órgão).
 */
export function fracaoDaLeitura(ano: number, concluidos: readonly Periodo[], pedidos: readonly PedidoAndamento[], orgaos: number | null): number {
  const diasAno = diasDoPeriodo(periodoDoAno(ano));
  const feitos = new Set(concluidos.map((p) => `${p.inicio}|${p.fim}`));
  let total = concluidos.reduce((s, p) => s + diasDoPeriodo(p), 0) / diasAno;
  const parte = (p: PedidoAndamento) => diasDoPeriodo(p.periodo) / diasAno / Math.max(1, orgaos ?? 1);
  // SEM órgãos (as páginas de um período em sequência, sem saber quantas): cada página lida vale METADE do que falta do
  // período — a barra nunca volta para trás ao começar a página seguinte.
  const paginasLidas = new Map<string, number>();
  if (!(orgaos && orgaos > 1)) for (const p of pedidos) if (p.fase === "concluido") paginasLidas.set(`${p.periodo.inicio}|${p.periodo.fim}`, (paginasLidas.get(`${p.periodo.inicio}|${p.periodo.fim}`) ?? 0) + 1);
  const contados = new Set<string>();
  for (const p of pedidos) {
    const k = `${p.periodo.inicio}|${p.periodo.fim}`;
    // O período já concluído inteiro está na conta acima (nunca duas vezes).
    if (feitos.has(k) || p.fase === "fila" || p.fase === "dividido") continue;
    if (orgaos && orgaos > 1) {
      // O pedido concluído de um período ainda aberto (o órgão já lido, os outros não) conta inteiro; o em curso, o que fez.
      total += parte(p) * (p.fase === "concluido" ? 1 : fracaoDoPedido(p));
      continue;
    }
    const n = paginasLidas.get(k) ?? 0;
    if (p.fase === "concluido") {
      if (contados.has(k)) continue;
      contados.add(k);
      total += parte(p) * (1 - 0.5 ** n);
    } else total += parte(p) * 0.5 ** (n + 1) * fracaoDoPedido(p);
  }
  return Math.min(1, total);
}

/** A fração GERAL da importação (0..1) pela etapa e pela leitura. */
export function fracaoGeral(etapa: EtapaImportacao, leitura: number, conclusaoMs = 0): number {
  const [de, ate] = FAIXA[etapa];
  if (etapa === "leitura") return de + (ate - de) * Math.min(1, Math.max(0, leitura));
  // A conclusão é um pedido só: anda devagar até perto do fim enquanto o servidor confere (nunca chega sozinha a 100%).
  if (etapa === "conclusao") return de + (ate - de) * (1 - Math.exp(-conclusaoMs / 20_000));
  return de;
}

const MB = 1024 * 1024;
/** "12,4 MB" / "830 KB". */
export function textoBytes(b: number): string {
  if (b >= MB) return `${(b / MB).toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} MB`;
  return `${Math.max(1, Math.round(b / 1024)).toLocaleString("pt-BR")} KB`;
}
const segundos = (ms: number) => `${Math.max(0, Math.floor(ms / 1000))} s`;
const num = (n: number) => n.toLocaleString("pt-BR");

/** O que o pedido está fazendo AGORA, por extenso ("Baixando 8,2 de 12,0 MB · 1,9 MB/s"). */
export function textoPedido(p: PedidoAndamento, agoraMs: number): string {
  const naFase = agoraMs - p.faseMs;
  const tentativa = p.tentativa > 1 ? ` · tentativa ${p.tentativa}` : "";
  switch (p.fase) {
    case "fila":
      return "Na fila";
    case "pedindo":
      return `Aguardando a Centi responder há ${segundos(naFase)}${tentativa}`;
    case "baixando": {
      const vel = naFase > 500 ? p.bytes / (naFase / 1000) : 0;
      const tam = p.bytesEsperados ? `${textoBytes(p.bytes)} de ≈ ${textoBytes(p.bytesEsperados)}` : `${textoBytes(p.bytes)} recebidos`;
      return `Baixando ${tam}${vel ? ` · ${textoBytes(vel)}/s` : ""}${tentativa}`;
    }
    case "lendo":
      return `Lendo a resposta (${textoBytes(p.bytes)})`;
    case "comparando":
      return `Comparando ${num(p.registros ?? 0)} registros com o que já está gravado`;
    case "gravando":
      return `Gravando no banco: parte ${num(Math.min(p.partes, p.partesFeitas + 1))} de ${num(p.partes)} · ${num(p.mudaram ?? 0)} com mudança, ${num(p.iguais ?? 0)} iguais`;
    case "concluido": {
      const dur = p.fimMs ? ` em ${segundos(p.fimMs - p.inicioMs)}` : "";
      const res = p.novos != null || p.alterados != null ? ` · ${num(p.novos ?? 0)} novos, ${num(p.alterados ?? 0)} alterados` : "";
      return `Lido: ${num(p.registros ?? 0)} registros${res}${dur}`;
    }
    case "dividido":
      return "Grande demais para um pedido — dividido em períodos menores";
    case "esperando":
      return `${p.mensagem ? `${p.mensagem} · ` : ""}nova tentativa em ${segundos(Math.max(0, (p.espera ?? 0) - naFase))}`;
    case "erro":
      return p.mensagem ?? "Falhou";
  }
}

/** O estado do pedido para uma lista de andamento (o painel do canto). */
export function estadoDoPedido(f: FasePedido): "ok" | "falhou" | "rodando" | "fila" {
  if (f === "concluido" || f === "dividido") return "ok";
  if (f === "erro") return "falhou";
  if (f === "fila") return "fila";
  return "rodando";
}

/** A ordem da lista: os em curso primeiro (o mais antigo antes), depois a fila, depois os concluídos (o mais recente antes). */
export function ordenarPedidos(l: readonly PedidoAndamento[]): PedidoAndamento[] {
  const peso = (p: PedidoAndamento) => (p.fase === "fila" ? 1 : p.fase === "concluido" || p.fase === "dividido" ? 2 : 0);
  return [...l].sort((a, b) => peso(a) - peso(b) || (peso(a) === 2 ? (b.fimMs ?? 0) - (a.fimMs ?? 0) : a.inicioMs - b.inicioMs));
}

/** O resumo de uma linha: "3 pedidos em curso · 2 na fila · 14 concluídos · 48.200 registros lidos". */
export function resumoPedidos(l: readonly PedidoAndamento[]): { emCurso: number; fila: number; concluidos: number; erros: number; registros: number; bytes: number } {
  let emCurso = 0;
  let fila = 0;
  let concluidos = 0;
  let erros = 0;
  let registros = 0;
  let bytes = 0;
  for (const p of l) {
    if (p.fase === "fila") fila++;
    else if (p.fase === "concluido" || p.fase === "dividido") concluidos++;
    else if (p.fase === "erro") erros++;
    else emCurso++;
    if (p.fase === "concluido") registros += p.registros ?? 0;
    bytes += p.bytes;
  }
  return { emCurso, fila, concluidos, erros, registros, bytes };
}
