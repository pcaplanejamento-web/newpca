"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cardPorOrgao, NOME_TIPO, type TipoCard } from "@/lib/empenho-cards-core";
import { num } from "@/lib/format";
import { Ajuda } from "./Ajuda";
import { AteOFim } from "./AlturaCheia";
import { IconEmpenho, IconLiquidacao, IconPagamento, IconSettings } from "./icons";

/**
 * Módulos EMPENHOS, LIQUIDAÇÕES e PAGAMENTOS — só os DADOS: a TABELA ÚNICA de todos os cards do tipo (montada pelo servidor
 * em `children`) sob a linha do título. As IMPORTAÇÕES (os cards, a configuração, os vínculos e a importação) ficam em
 * Configurações → Importações (só o ADM) — o atalho no título leva até lá.
 */
export function EmpenhosView({
  tipo,
  total,
  importacoes,
  children,
}: {
  tipo: TipoCard;
  /** Quantos registros gravados (todos os cards do tipo, no escopo da pessoa). */
  total: number;
  /** O endereço das importações do tipo (só para o ADM). */
  importacoes?: string;
  children: ReactNode;
}) {
  const liq = cardPorOrgao(tipo);
  const pag = tipo === "pagamentos";
  const nomeTipo = NOME_TIPO[tipo];
  const Icone = pag ? IconPagamento : liq ? IconLiquidacao : IconEmpenho;
  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="linha-topico flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold text-text">
            <Icone className="h-5 w-5" /> {nomeTipo.titulo}
          </h1>
          <p className="text-sm text-muted">
            {num(total)} {total === 1 ? `${nomeTipo.um} ${nomeTipo.masc ? "gravado" : "gravada"}` : `${nomeTipo.varios} ${nomeTipo.masc ? "gravados" : "gravadas"}`} · todos os cards numa tabela só
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {importacoes && (
            <Link
              href={importacoes}
              title="Importações (Configurações)"
              aria-label={`Importações de ${nomeTipo.varios} (Configurações)`}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-control border border-border-2 bg-surface text-text-2 transition-colors hover:bg-surface-2 lg:h-[var(--h-control-sm)] lg:w-[var(--h-control-sm)]"
            >
              <IconSettings className="h-4 w-4" />
            </Link>
          )}
          {pag ? (
            <Ajuda titulo="Pagamentos" botao="sm">
              <p>
                Cada <strong>card</strong> importa os pagamentos (as ordens de pagamento) da Centi com a sua própria configuração: a integração, os
                anos, a atualização automática e as regras da conferência.
              </p>
              <p>
                A Centi entrega os pagamentos por <strong>órgão</strong> e por <strong>mês</strong>: cada importação lê <strong>todos</strong> os
                órgãos com o “ID na Centi” cadastrado em Órgãos e Unidades, mês a mês, com os órgãos de cada mês ao mesmo tempo.
              </p>
              <p>
                A Centi não informa a unidade: o <strong>número do empenho</strong> liga o pagamento ao empenho — o órgão e a unidade dele são os do
                empenho no sistema. As ordens com anulação ficam guardadas e fora do pago líquido.
              </p>
              <p>As importações (os cards, a configuração e a leitura da Centi) ficam em Configurações → Importações.</p>
            </Ajuda>
          ) : liq ? (
            <Ajuda titulo="Liquidações" botao="sm">
              <p>
                Cada <strong>card</strong> importa as liquidações da Centi com a sua própria configuração: os órgãos, a integração, os anos, a
                atualização automática e as regras da conferência — independente dos empenhos.
              </p>
              <p>
                A Centi entrega as liquidações por <strong>órgão</strong>: cada importação lê <strong>todos</strong> os órgãos com o “ID na Centi”
                cadastrado em Órgãos e Unidades, semana a semana.
              </p>
              <p>
                A Centi não informa a unidade: o <strong>número do empenho</strong> liga a liquidação ao empenho — o órgão e a unidade dela são os
                do empenho no sistema.
              </p>
              <p>As importações (os cards, a configuração e a leitura da Centi) ficam em Configurações → Importações.</p>
            </Ajuda>
          ) : (
          <Ajuda titulo="Empenhos" botao="sm">
            <p>
              Cada <strong>card</strong> é uma importação dos empenhos da Centi com a sua própria configuração: o endereço e os parâmetros da
              integração, os anos, a atualização automática (horário, frequência, dias úteis), as regras da conferência e os vínculos.
            </p>
            <p>
              Os <strong>vínculos</strong> dizem o que entra: quais órgãos gestores, unidades orçamentárias e ações da Centi o card importa e a
              que órgão ou unidade do cadastro cada um pertence. Só o que um vínculo cobre é gravado.
            </p>
            <p>Esta tabela junta todos os cards (o mesmo empenho em dois cards aparece uma vez — a coluna Card diz de onde veio).</p>
            <p>As importações (os cards, a configuração, os vínculos e a leitura da Centi) ficam em Configurações → Importações.</p>
          </Ajuda>
          )}
        </div>
      </div>
      <AteOFim>{children}</AteOFim>
    </div>
  );
}

