"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { cardPorOrgao, estadoCard, NOME_TIPO, type ResumoCard, rotaDoCard, rotuloAnos, type TipoCard } from "@/lib/empenho-cards-core";
import { dataHoraBR, num } from "@/lib/format";
import { AbasEspaco } from "./AbasEspaco";
import { Ajuda } from "./Ajuda";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { AteOFim } from "./EmpenhoCardView";
import { SelectField, TextField } from "./Field";
import { IconEmpenho, IconInbox, IconLiquidacao, IconPagamento } from "./icons";
import { Modal } from "./Modal";
import { CartaoFinanceiro, GRADE_ORCAMENTOS } from "./OrcamentoCard";
import { QuadroNovoCard } from "./QuadroCard";
import { toast } from "./Toast";

/** As abas da tela do módulo: os DADOS (a tabela única de todos os cards — o padrão) e as IMPORTAÇÕES (os cards). */
export type AbaModuloEmpenhos = "dados" | "importacoes";

/**
 * Módulos EMPENHOS, LIQUIDAÇÕES e PAGAMENTOS — abrem em **Dados** (a TABELA ÚNICA de todos os cards do tipo, montada pelo
 * servidor em `children`) e trocam para **Importações** = a LISTA de CARDS do tipo (no padrão do Orçamento): cada card é uma importação da Centi com a PRÓPRIA
 * configuração (integração, anos, programação, regras e vínculos) e a SUA tabela no banco. O card "+" (quem configura)
 * cria um card — com os vínculos copiados de outro, se escolhido — e abre a Configuração dele. Tocar num card abre o
 * ESPAÇO do card (`/painel/empenhos/[id]`: Empenhos · Vínculos · Importação · Configuração; o de LIQUIDAÇÕES — independente
 * dos empenhos — tem Liquidações · Órgãos · Importação · Configuração). 100% design-system.
 */
export function EmpenhosView({
  tipo,
  cards,
  podeCriar,
  aba = "importacoes",
  children,
}: {
  tipo: TipoCard;
  cards: ResumoCard[];
  podeCriar: boolean;
  /** A aba que o servidor montou. */
  aba?: AbaModuloEmpenhos;
  /** A aba DADOS (a tabela única), montada pelo servidor. */
  children?: ReactNode;
}) {
  const liq = cardPorOrgao(tipo);
  const pag = tipo === "pagamentos";
  const nomeTipo = NOME_TIPO[tipo];
  const Icone = pag ? IconPagamento : liq ? IconLiquidacao : IconEmpenho;
  const router = useRouter();
  const [novo, setNovo] = useState(false);
  const [nome, setNome] = useState("");
  const [copiarDe, setCopiarDe] = useState("");
  const [criando, setCriando] = useState(false);
  const total = cards.reduce((s, c) => s + c.empenhos, 0);

  async function criar() {
    if (!nome.trim()) return;
    setCriando(true);
    try {
      const r = await fetch("/api/empenhos/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, nome: nome.trim(), copiarDe: copiarDe ? Number(copiarDe) : null }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; id?: number };
      if (!r.ok || !j.ok || !j.id) throw new Error(j.error ?? "Não foi possível criar o card.");
      toast.success(`Card "${nome.trim()}" criado — confirme a configuração e ${liq ? "os órgãos" : "os vínculos"} antes de importar.`);
      router.push(rotaDoCard({ id: j.id, tipo }, "configuracao"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível criar o card.");
      setCriando(false);
    }
  }

  const cabecalho = (
    <>
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-xl font-bold text-text">
          <Icone className="h-5 w-5" /> {nomeTipo.titulo}
        </h1>
        <p className="text-sm text-muted">
          {num(cards.length)} {cards.length === 1 ? "card" : "cards"} · {num(total)} {total === 1 ? `${nomeTipo.um} ${nomeTipo.masc ? "gravado" : "gravada"}` : `${nomeTipo.varios} ${nomeTipo.masc ? "gravados" : "gravadas"}`} ·{" "}
          {aba === "dados" ? "todos numa tabela só — os cards ficam em Importações" : `abra um card para ver a tabela, ${liq ? "os órgãos" : "os vínculos"} e a importação`}
        </p>
      </div>
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
        <p>Cada card tem a sua tabela no banco — a aba Empenhos mostra exatamente o que está gravado. Excluir o card exclui os empenhos dele.</p>
        <p>As liquidações e os pagamentos ficam nas telas Liquidações e Pagamentos, com cards próprios.</p>
      </Ajuda>
      )}
    </>
  );

  return (
    <div className="space-y-[var(--gap-block)]">
      <AbasEspaco<AbaModuloEmpenhos>
        aba={aba}
        cabecalho={cabecalho}
        opcoes={[
          { value: "dados", label: "Dados" },
          { value: "importacoes", label: `Importações (${num(cards.length)})`, curto: "Importações" },
        ]}
      >
        {aba === "dados" ? (
          <AteOFim>{children}</AteOFim>
        ) : (
          cards.length === 0 && !podeCriar ? (
            <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border-2 bg-surface p-10 text-center">
              <IconInbox className="h-10 w-10 text-faint" />
              <p className="text-sm text-muted">Nenhum card de {nomeTipo.varios} ainda.</p>
            </div>
          ) : (
            <div className={GRADE_ORCAMENTOS}>
              {cards.map((c) => {
                const e = estadoCard(c, c.lendo);
                return (
                  <CartaoFinanceiro
                    key={c.id}
                    href={rotaDoCard(c)}
                    icone={<Icone className="h-5 w-5" />}
                    sobretitulo={`${nomeTipo.titulo} · ${rotuloAnos(c.anos)}`}
                    nome={c.nome}
                    selo={
                      <Badge tone={e.tom} dot vivo={c.lendo} tamanho="linha">
                        {e.rotulo}
                      </Badge>
                    }
                    {...(pag
                      ? {
                          destaque: { rotulo: "Pago líquido", valor: c.liquidado },
                          barra: {
                            rotulo: "Retenções",
                            pct: c.soma - c.anulado > 0 ? (c.pago / (c.soma - c.anulado)) * 100 : 0,
                            texto: `${(c.soma - c.anulado > 0 ? (c.pago / (c.soma - c.anulado)) * 100 : 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% retido`,
                          },
                          linhas: [
                            { rotulo: `Ordens · ${num(c.empenhos)} pagamentos`, valor: c.soma },
                            { rotulo: `Anuladas · ${num(c.saldoPagar)}`, valor: c.anulado, sinal: "−" as const, tom: "text-[var(--danger)]" },
                            { rotulo: "Retenções", valor: c.pago, sinal: "−" as const, tom: "text-text" },
                            "divisor" as const,
                            { rotulo: "Pago líquido", valor: c.liquidado, tom: "text-[var(--ok)]" },
                          ],
                          numeros: [
                            { valor: c.vinculos, rotulo: "órgãos" },
                            { valor: c.unidadesOrc, rotulo: "unidades" },
                            { valor: c.acoes, rotulo: "empenhos" },
                            { valor: c.fornecedores, rotulo: "credores" },
                          ],
                          rodape: c.ultimaExecucao ? `Última leitura em ${dataHoraBR(c.ultimaExecucao)}` : "Ainda não importado",
                        }
                      : liq
                      ? {
                          destaque: { rotulo: "Liquidado líquido", valor: c.liquidado },
                          barra: { rotulo: "Pagamento", pct: c.liquidado > 0 ? (c.pago / c.liquidado) * 100 : 0, texto: `${(c.liquidado > 0 ? (c.pago / c.liquidado) * 100 : 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% pago` },
                          linhas: [
                            { rotulo: `Liquidado · ${num(c.empenhos)} liquidações`, valor: c.soma },
                            { rotulo: "Anulado", valor: c.anulado, sinal: "−" as const, tom: "text-[var(--danger)]" },
                            "divisor" as const,
                            { rotulo: "Pago", valor: c.pago, tom: "text-[var(--ok)]" },
                            { rotulo: "Saldo", valor: c.saldoPagar, tom: "text-text" },
                          ],
                          numeros: [
                            { valor: c.vinculos, rotulo: "órgãos" },
                            { valor: c.unidadesOrc, rotulo: "unidades" },
                            { valor: c.acoes, rotulo: "empenhos" },
                            { valor: c.fornecedores, rotulo: "credores" },
                          ],
                          rodape: c.ultimaExecucao ? `Última leitura em ${dataHoraBR(c.ultimaExecucao)}` : "Ainda não importado",
                        }
                      : {
                          destaque: { rotulo: "Empenhado líquido", valor: c.soma - c.anulado },
                          barra: { rotulo: "Execução", pct: c.soma - c.anulado > 0 ? (c.pago / (c.soma - c.anulado)) * 100 : 0, texto: `${(c.soma - c.anulado > 0 ? (c.pago / (c.soma - c.anulado)) * 100 : 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% pago` },
                          linhas: [
                            { rotulo: `Empenhado · ${num(c.empenhos)} empenhos`, valor: c.soma },
                            { rotulo: "Anulado", valor: c.anulado, sinal: "−" as const, tom: "text-[var(--danger)]" },
                            "divisor" as const,
                            { rotulo: "Liquidado", valor: c.liquidado, tom: "text-text" },
                            { rotulo: "Pago", valor: c.pago, tom: "text-[var(--ok)]" },
                            { rotulo: "Saldo a pagar", valor: c.saldoPagar, tom: "text-text" },
                          ],
                          numeros: [
                            { valor: c.gestores, rotulo: "órgãos gestores" },
                            { valor: c.unidadesOrc, rotulo: "unidades orç." },
                            { valor: c.acoes, rotulo: "ações" },
                            { valor: c.fornecedores, rotulo: "fornecedores" },
                            { valor: c.vinculos, rotulo: "vínculos" },
                          ],
                          rodape: c.ultimaExecucao ? `Última leitura em ${dataHoraBR(c.ultimaExecucao)}` : "Ainda não importado",
                        })}
                  />
                );
              })}
              {podeCriar && <QuadroNovoCard onClick={() => setNovo(true)} rotulo="Novo card" />}
            </div>
          )
        )}
      </AbasEspaco>

      <Modal
        open={novo}
        onClose={() => !criando && setNovo(false)}
        bloqueado={criando}
        size="md"
        titulo={`Novo card de ${nomeTipo.varios}`}
        rodape={
          <div className="flex w-full justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => setNovo(false)} disabled={criando}>
              Cancelar
            </Button>
            <Button size="sm" onClick={criar} loading={criando} disabled={!nome.trim()}>
              Criar
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <TextField denso label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} autoFocus placeholder={`Ex.: ${nomeTipo.titulo} da Saúde`} />
          {!liq && (
          <SelectField
            denso
            label="Copiar os vínculos de"
            value={copiarDe}
            onChange={(e) => setCopiarDe(e.target.value)}
            rotuloExtra={
              <Ajuda titulo="Copiar os vínculos" compacta>
                O card novo começa com os mesmos vínculos do card escolhido (depois cada um segue o seu). Nenhum = o card começa vazio —
                escolha na aba Vínculos o que ele importa.
              </Ajuda>
            }
          >
            <option value="">Nenhum (começar vazio)</option>
            {cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome} ({num(c.vinculos)} vínculos)
              </option>
            ))}
          </SelectField>
          )}
          <p className="text-[12.5px] text-muted">
            {liq ? (
              <>
                Depois de criar, confirme a <strong>Configuração</strong> (integração, anos, atualização e regras) — a importação lê todos os
                órgãos com o “ID na Centi” cadastrado em Órgãos e Unidades.
              </>
            ) : (
              <>
            Depois de criar: 1. confirme a <strong>Configuração</strong> (integração, anos, atualização e regras), 2. crie os <strong>Vínculos</strong>.
            Só então a importação é liberada.
              </>
            )}
          </p>
        </div>
      </Modal>
    </div>
  );
}
