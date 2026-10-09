import type { ComponentType } from "react";
import type { TipoNotificacao } from "@/lib/tarefas-core";
import {
  IconAtribuir,
  IconAutomacao,
  IconCadastro,
  IconCalendar,
  IconCheck,
  IconClipboard,
  IconComentario,
  IconEventoAlterado,
  IconLayers,
  IconMegafone,
  IconNovidades,
  IconMencao,
  IconPrazo,
  IconRobo,
} from "./icons";

/** Ícone, cor (token) e rótulo curto de cada TIPO de aviso — a fonte única do sino, do Perfil e da tela do ADM. */
export const VISUAL_AVISO: Record<TipoNotificacao | "acesso", { Icone: ComponentType<{ className?: string }>; cor: string; rotulo: string }> = {
  atribuida: { Icone: IconAtribuir, cor: "var(--accent)", rotulo: "Atribuídas" },
  mencionada: { Icone: IconMencao, cor: "var(--info)", rotulo: "Menções" },
  comentario: { Icone: IconComentario, cor: "var(--info)", rotulo: "Comentários" },
  vence_hoje: { Icone: IconPrazo, cor: "var(--warn)", rotulo: "Vence hoje" },
  vence_amanha: { Icone: IconPrazo, cor: "var(--warn)", rotulo: "Vence amanhã" },
  atrasada: { Icone: IconPrazo, cor: "var(--danger)", rotulo: "Atrasadas" },
  automacao: { Icone: IconAutomacao, cor: "var(--accent)", rotulo: "Automações" },
  concluida: { Icone: IconCheck, cor: "var(--ok)", rotulo: "Concluídas" },
  lembrete: { Icone: IconCalendar, cor: "var(--info)", rotulo: "Lembretes" },
  convite: { Icone: IconCalendar, cor: "var(--accent)", rotulo: "Convites" },
  resposta: { Icone: IconCalendar, cor: "var(--ok)", rotulo: "Respostas" },
  evento: { Icone: IconEventoAlterado, cor: "var(--warn)", rotulo: "Eventos" },
  protocolo: { Icone: IconClipboard, cor: "var(--accent)", rotulo: "Protocolos" },
  situacao: { Icone: IconClipboard, cor: "var(--info)", rotulo: "Protocolo atualizado" },
  pca: { Icone: IconLayers, cor: "var(--info)", rotulo: "PCA" },
  centi: { Icone: IconRobo, cor: "var(--accent)", rotulo: "Centi" },
  comunicado: { Icone: IconMegafone, cor: "var(--accent)", rotulo: "Comunicados" },
  versao: { Icone: IconNovidades, cor: "var(--accent)", rotulo: "Versões" },
  cadastro: { Icone: IconCadastro, cor: "var(--accent)", rotulo: "Cadastros" },
  acesso: { Icone: IconCadastro, cor: "var(--ok)", rotulo: "Acesso liberado" },
};

export const visualAviso = (tipo: string) => VISUAL_AVISO[tipo as TipoNotificacao] ?? VISUAL_AVISO.automacao;
