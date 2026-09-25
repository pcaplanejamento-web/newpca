import { ABAS, type AbaKey } from "@/lib/abas";
import { IconBox, IconCalendar, IconClipboard, IconKanban, IconLayers, IconWallet } from "./icons";

const ICONE: Record<AbaKey, typeof IconClipboard> = { dfd: IconClipboard, pca: IconBox, catalogo: IconLayers, orcamento: IconWallet, tarefas: IconKanban };

/** Os MÓDULOS na navegação (sidebar e barra inferior) — rota, rótulo e ícone de cada aba, na ordem de `ABAS` (fonte
 * única); cada um só aparece para quem tem a aba liberada (o admin vê todos). */
export const NAV_MODULOS = ABAS.map((a) => ({ href: a.href, label: a.label, Icon: ICONE[a.key], aba: a.key }));

/** O CALENDÁRIO de todos os quadros de tarefas — item do menu lateral logo depois de Tarefas (mesma permissão: a aba
 * `tarefas`). Fica fora da barra inferior do celular (lá, o acesso é pelo "Quadros | Calendário" da tela de Tarefas). */
export const NAV_CALENDARIO = { href: "/painel/calendario", label: "Calendário", Icon: IconCalendar, aba: "tarefas" as const };
