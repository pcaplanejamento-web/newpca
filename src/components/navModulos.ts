import { ABAS, type AbaKey } from "@/lib/abas";
import { IconBox, IconClipboard, IconKanban, IconLayers, IconWallet } from "./icons";

const ICONE: Record<AbaKey, typeof IconClipboard> = { dfd: IconClipboard, pca: IconBox, catalogo: IconLayers, orcamento: IconWallet, tarefas: IconKanban };

/** Os MÓDULOS na navegação (sidebar e barra inferior) — rota, rótulo e ícone de cada aba, na ordem de `ABAS` (fonte
 * única); cada um só aparece para quem tem a aba liberada (o admin vê todos). */
export const NAV_MODULOS = ABAS.map((a) => ({ href: a.href, label: a.label, Icon: ICONE[a.key], aba: a.key }));
