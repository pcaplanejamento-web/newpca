import { ABAS, type AbaKey } from "@/lib/abas";
import {
  IconBox,
  IconCalendar,
  IconClipboard,
  IconCombustivel,
  IconDocumentos,
  IconEmpenho,
  IconExecucao,
  IconFrota,
  IconKanban,
  IconLayers,
  IconLiquidacao,
  IconManutencao,
  IconPagamento,
  IconVeiculo,
  IconVerificacao,
  IconWallet,
} from "./icons";

const ICONE: Record<AbaKey, typeof IconClipboard> = {
  dfd: IconClipboard,
  pca: IconBox,
  catalogo: IconLayers,
  orcamento: IconWallet,
  tarefas: IconKanban,
  calendario: IconCalendar,
  verificacao: IconVerificacao,
  documentos: IconDocumentos,
  empenhos: IconEmpenho,
  liquidacoes: IconLiquidacao,
  pagamentos: IconPagamento,
  execucao: IconExecucao,
  frotas: IconFrota,
  combustivel: IconCombustivel,
  manutencao: IconManutencao,
  veiculos: IconVeiculo,
};

/** Os MÓDULOS na navegação (sidebar e barra inferior) — rota, rótulo e ícone de cada aba, na ordem de `ABAS` (fonte
 * única); cada um só aparece para quem tem a aba liberada (o admin vê todos). */
export const NAV_MODULOS = ABAS.map((a) => ({ href: a.href, label: a.label, Icon: ICONE[a.key], aba: a.key }));
