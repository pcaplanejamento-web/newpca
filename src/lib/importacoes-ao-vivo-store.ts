import { type LoteCenti, type PassoLote, periodosLidos } from "./empenhos-core.ts";
import { type EtapaImportacao, fracaoDaLeitura, fracaoDoPedido, fracaoGeral, type PedidoAndamento } from "./importacao-progresso.ts";

/**
 * AS IMPORTAÇÕES DESTA ABA, ao vivo: `importarCard` publica aqui o andamento de cada importação (as etapas, cada pedido à
 * Centi com a fase, os passos que chegaram) — a aba Importação do card, o "Importar tudo" e o painel do canto inferior
 * direito leem o MESMO estado. Fica fora do React: sair da tela não perde nada (a importação continua e o painel segue).
 */
/** A preferência do ADM (`preferencias_tabela`) — `{desligado: true}` tira o andamento das importações do canto. */
export const PREF_IMPORTACOES_AO_VIVO = "importacoes:ao-vivo";
/** A chave do `ManterVivo` das Importações (Configurações): a importação desta aba mantém a tela viva fora dela. */
export const CHAVE_IMPORTACOES = "importacoes";

export type EstadoImportacaoLocal = "rodando" | "gravado" | "parcial" | "falhou" | "interrompido" | "cancelado";

export type ImportacaoLocal = {
  /** A chave desta importação nesta aba (o lote só existe depois de começar). */
  id: string;
  /** O card (Centi); null = a importação da FROTA (Vólus), sem card nem lote. */
  cardId: number | null;
  titulo: string;
  ano: number;
  rota: string;
  lote: LoteCenti | null;
  etapa: EtapaImportacao;
  /** Quando a etapa atual começou (a conclusão anda pelo tempo). */
  etapaMs: number;
  inicioMs: number;
  fimMs: number | null;
  pedidos: PedidoAndamento[];
  passos: PassoLote[];
  /** As assinaturas lidas (o que já está gravado no ano). */
  assinaturas: number | null;
  estado: EstadoImportacaoLocal;
  /** O desfecho por extenso (ou o erro). */
  texto: string | null;
  /** Aguardando a confirmação de uma queda na tela da importação. */
  aguardandoConfirmacao: boolean;
  /** A queda perguntada no PAINEL DO CANTO (a importação sem tela que pergunte — o "Importar agora" da Execução): a
   * resposta grava (true) ou cancela (false). Ausente = a tela da importação pergunta. */
  responder?: ((sim: boolean) => void) | null;
  /** O tipo de card (empenhos, liquidações, pagamentos) ou "frotas". */
  tipo?: string;
  /** Quantos pedidos a importação faz (a FROTA conhece a fila): com ele, a fração = os pedidos concluídos ÷ o total. */
  totalPedidos?: number;
  /** Pede a interrupção (o laço confere a cada pedido). */
  parar: () => void;
};

type Ouvinte = () => void;
const importacoes = new Map<string, ImportacaoLocal>();
const ouvintes = new Set<Ouvinte>();
let foto: ImportacaoLocal[] = [];
let agendado = false;

/** Avisa os ouvintes no próximo quadro (dezenas de mudanças por segundo viram UMA atualização da tela). */
function avisar() {
  if (agendado) return;
  agendado = true;
  const rodar = () => {
    agendado = false;
    foto = [...importacoes.values()];
    for (const o of ouvintes) o();
  };
  if (typeof requestAnimationFrame === "function" && typeof document !== "undefined" && document.visibilityState === "visible") requestAnimationFrame(rodar);
  else setTimeout(rodar, 120);
}

export function publicarImportacao(i: ImportacaoLocal) {
  importacoes.set(i.id, i);
  avisar();
}

export function mudarImportacao(id: string, f: (i: ImportacaoLocal) => ImportacaoLocal) {
  const atual = importacoes.get(id);
  if (!atual) return;
  importacoes.set(id, f(atual));
  avisar();
}

/** Muda (ou acrescenta) UM pedido da importação. */
export function mudarPedido(id: string, chave: string, f: (p: PedidoAndamento | undefined) => PedidoAndamento) {
  mudarImportacao(id, (i) => {
    const idx = i.pedidos.findIndex((p) => p.chave === chave);
    const novo = f(idx >= 0 ? i.pedidos[idx] : undefined);
    const pedidos = idx >= 0 ? i.pedidos.map((p, k) => (k === idx ? novo : p)) : [...i.pedidos, novo];
    return { ...i, pedidos };
  });
}

export function retirarImportacao(id: string) {
  if (importacoes.delete(id)) avisar();
}

export function assinarImportacoes(o: Ouvinte): () => void {
  ouvintes.add(o);
  return () => ouvintes.delete(o);
}

export const importacoesLocais = (): ImportacaoLocal[] => foto;
const VAZIO: ImportacaoLocal[] = [];
export const importacoesLocaisServidor = (): ImportacaoLocal[] => VAZIO;

/** Os lotes conduzidos por ESTA aba agora (o painel do servidor não os repete). */
export function lotesDestaAba(): Set<number> {
  const s = new Set<number>();
  for (const i of importacoes.values()) if (i.estado === "rodando" && i.lote) s.add(i.lote.id);
  return s;
}

/** A fração GERAL da importação desta aba (0..1), pela etapa, pelos períodos lidos e pelo que cada pedido em curso já fez. */
export function fracaoDaImportacao(i: Pick<ImportacaoLocal, "etapa" | "etapaMs" | "ano" | "passos" | "pedidos" | "lote" | "estado"> & { totalPedidos?: number }, agoraMs: number): number {
  if (i.estado === "gravado") return 1;
  if (i.totalPedidos != null) {
    // A fila conhecida (a Frota): cada pedido concluído conta inteiro; o em curso, o que já fez.
    if (i.totalPedidos <= 0) return 0;
    const feito = i.pedidos.reduce((s, p) => s + (p.fase === "concluido" || p.fase === "dividido" || p.fase === "erro" ? 1 : fracaoDoPedido(p)), 0);
    return Math.min(1, feito / i.totalPedidos);
  }
  const orgaos = i.lote?.orgaosCenti?.length ?? null;
  const leitura = i.etapa === "leitura" || i.etapa === "conclusao" ? fracaoDaLeitura(i.ano, periodosLidos(i.passos), i.pedidos, orgaos) : 0;
  return fracaoGeral(i.etapa, i.etapa === "conclusao" ? 1 : leitura, agoraMs - i.etapaMs);
}

/**
 * CONSULTAR A ÚLTIMA IMPORTAÇÃO de um tipo de card (o relógio dos indicadores da Execução): quem pede não precisa saber
 * quem mostra — o monitor do painel do canto (`MonitorImportacoes`) ouve, busca e abre o painel nela.
 */
type OuvinteConsulta = (tipo: string) => void;
const ouvintesConsulta = new Set<OuvinteConsulta>();
export function consultarUltimaImportacao(tipo: string): boolean {
  for (const o of ouvintesConsulta) o(tipo);
  return ouvintesConsulta.size > 0;
}
export function aoConsultarImportacao(o: OuvinteConsulta): () => void {
  ouvintesConsulta.add(o);
  return () => ouvintesConsulta.delete(o);
}
