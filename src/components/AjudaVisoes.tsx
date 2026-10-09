"use client";

import { Ajuda, TopicoAjuda } from "./Ajuda";
import { IconFilter, IconLink, IconRefresh, IconSave, IconUsers } from "./icons";

/**
 * O (?) ÚNICO das VISÕES do orçamento — o mesmo texto na tela do orçamento (Visões, Vínculos, banner da visão) e no
 * orçamento do PCA: o que a visão filtra, os vínculos próprios × o padrão, onde salvar e quem usa. `usos` = os PCAs da
 * visão aberta (o banner); `botao` = o desenho dos botões só-ícone de uma barra.
 */
export function AjudaVisoes({ usos, botao }: { usos?: string[]; botao?: boolean | "xs" | "sm" }) {
  return (
    <Ajuda titulo="Visões do orçamento" botao={botao}>
      <TopicoAjuda icone={<IconFilter className="h-4 w-4" />} titulo="O que a visão filtra">
        Função, programa, elemento, código, ficha e fonte. Dentro de uma dimensão vale qualquer valor marcado; entre dimensões, todas.
      </TopicoAjuda>
      <TopicoAjuda icone={<IconLink className="h-4 w-4" />} titulo="Vínculos da visão">
        Os vínculos ligam cada unidade do orçamento às unidades cadastradas, pelas ações. Toda visão segue o PADRÃO até ganhar vínculos
        próprios numa unidade — aí valem os dela, só naquela unidade.
      </TopicoAjuda>
      <TopicoAjuda icone={<IconSave className="h-4 w-4" />} titulo="Onde salvar">
        Ao salvar um vínculo: “Esta visão” (ou “Padrão”, sem visão), “Todas” (o padrão e as visões com vínculos próprios na unidade) ou
        “Escolher” as visões.
      </TopicoAjuda>
      <TopicoAjuda icone={<IconRefresh className="h-4 w-4" />} titulo="Voltar ao padrão">
        No vínculo próprio de uma visão, “Usar o padrão” apaga os vínculos dela naquela unidade — volta a seguir o padrão.
      </TopicoAjuda>
      <TopicoAjuda icone={<IconUsers className="h-4 w-4" />} titulo="Onde vale">
        {usos
          ? usos.length > 0
            ? `Usada por ${usos.length === 1 ? "1 PCA" : `${usos.length} PCAs`}: ${usos.join("; ")} — alterar a visão muda o orçamento deles (KPIs, PCA × Orçamento, Comparativo e relatório).`
            : "Nenhum PCA usa esta visão ainda. No Comparativo, escolha-a para ver o orçamento por ela."
          : "No PCA (a visão da Configuração: KPIs, PCA × Orçamento, Comparativo e relatório) e no Comparativo do orçamento."}
      </TopicoAjuda>
    </Ajuda>
  );
}
