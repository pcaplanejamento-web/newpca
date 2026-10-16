"use client";

import type { ReactNode } from "react";
import {
  coerceDetalhes,
  type DetalhesPapel,
  type LinhasMesa,
  LINHAS_MESA,
  MODELOS_DETALHES,
  NIVEIS_RESPONSAVEL,
  type NivelResponsavel,
  ROTULO_LINHAS,
  ROTULO_NIVEL_RESPONSAVEL,
} from "@/lib/papeis-detalhes-core";
import { CATALOGO_PAPEIS, ROTULO_ACAO, rotuloTela, type Tela } from "@/lib/papeis-catalogo";
import { acoesDoComponente, alternarAcaoComponente, componentesDaTela } from "@/lib/papeis-componentes-core";
import { Ajuda } from "./Ajuda";
import { Callout } from "./Callout";
import { SelectField } from "./Field";
import { IconInfo } from "./icons";
import { Segmented } from "./Segmented";
import { Switch } from "./Switch";

/** Uma linha do editor: o controle + o que ele faz; marcada quando difere do gravado (`alterado`). */
function Linha({ titulo, ajuda, alterado, children }: { titulo: string; ajuda: ReactNode; alterado: boolean; children: ReactNode }) {
  return (
    <div
      className={`flex flex-col gap-2 border-l-2 py-2.5 pl-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 ${alterado ? "border-accent" : "border-transparent"}`}
    >
      <div className="min-w-0">
        <p className="flex items-center gap-1 text-[13.5px] font-medium text-text">
          {titulo}
          {alterado && <span className="sr-only"> (alterado)</span>}
          <Ajuda titulo={titulo} rotulo="Ajuda" compacta>
            {ajuda}
          </Ajuda>
        </p>
        <p className="text-[12.5px] leading-snug text-muted">{ajuda}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

const RESUMO_ALTERAR: Record<NivelResponsavel, string> = {
  nao: "Só vê o Responsável; não troca em nenhum lugar (célula, banner, massa, padrão ao protocolar).",
  si: "Assume o protocolo SEM responsável e solta o seu; tomar o de outra pessoa exige “Qualquer pessoa do grupo”.",
  grupo: "Escolhe qualquer pessoa ativa do grupo (como antes).",
};

/**
 * EDITOR dos DETALHES do papel — o controle FINO dentro das telas que o papel abre (as ações ficam na
 * `MatrizCapacidades`). Os detalhes só RETIRAM acesso; o Administrador os ignora. Controlado (`valor` → `onChange` com o
 * conjunto normalizado — as implicações do núcleo valem na hora: sem ver o Responsável não se altera; sem Responsável e
 * sem Distribuição não há desempenho por pessoa). Sem `onChange` = só leitura. `original` = o gravado (as linhas que
 * mudaram ficam marcadas).
 *
 * Seção "Pessoas e linhas": o Responsável (ver · alterar em 3 níveis), a Distribuição, as LINHAS da Mesa ("só os meus",
 * aplicado no servidor) e o desempenho por pessoa do Dashboard.
 */
export function DetalhesPapelEditor({ valor, original, onChange }: { valor: DetalhesPapel; original?: DetalhesPapel; onChange?: (d: DetalhesPapel) => void }) {
  const v = coerceDetalhes(valor);
  const o = original ? coerceDetalhes(original) : v;
  const so = !onChange;
  const mudar = (mesa: Partial<DetalhesPapel["mesa"]>) => onChange?.(coerceDetalhes({ ...v, mesa: { ...v.mesa, ...mesa } }));
  const m = v.mesa;
  const semPessoas = !m.responsavel.ver && !m.distribuicao;
  return (
    <div className="space-y-[var(--gap-block)]">
      {!so && (
        <SelectField
          label="Começar de"
          value=""
          onChange={(e) => {
            const modelo = MODELOS_DETALHES.find((x) => x.id === e.target.value);
            if (modelo) onChange?.(coerceDetalhes(modelo.detalhes));
          }}
        >
          <option value="">Escolha um modelo…</option>
          {MODELOS_DETALHES.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nome} — {x.descricao}
            </option>
          ))}
        </SelectField>
      )}

      <section aria-labelledby="det-pessoas" className="rounded-card border border-border bg-surface p-[var(--pad-card)]">
        <h4 id="det-pessoas" className="text-[14px] font-bold text-text">
          Pessoas e linhas
        </h4>
        <p className="mb-1 text-[12.5px] text-muted">Na Mesa do sistema e na Mesa de cada PCA. O que fica oculto não sai do servidor.</p>
        <div className="divide-y divide-border">
          <Linha
            titulo="Ver o Responsável"
            ajuda="A coluna, o filtro do topo, a célula, o Dashboard e o histórico da troca. Oculto, também não altera."
            alterado={m.responsavel.ver !== o.mesa.responsavel.ver}
          >
            <Switch
              checked={m.responsavel.ver}
              disabled={so}
              onChange={(ver) => mudar({ responsavel: { ...m.responsavel, ver } })}
              label={m.responsavel.ver ? "Visível" : "Oculto"}
            />
          </Linha>
          <Linha titulo="Alterar o Responsável" ajuda={RESUMO_ALTERAR[m.responsavel.alterar]} alterado={m.responsavel.alterar !== o.mesa.responsavel.alterar}>
            <Segmented<NivelResponsavel>
              value={m.responsavel.alterar}
              disabled={so || !m.responsavel.ver}
              onChange={(alterar) => mudar({ responsavel: { ...m.responsavel, alterar } })}
              ariaLabel="Alterar o Responsável"
              options={NIVEIS_RESPONSAVEL.map((n) => ({
                value: n,
                label: ROTULO_NIVEL_RESPONSAVEL[n],
                curto: n === "nao" ? "Não" : n === "si" ? "Só para si" : "Qualquer um",
              }))}
            />
          </Linha>
          <Linha
            titulo="Ver a Distribuição"
            ajuda={
              m.distribuicao
                ? "Quem protocolou: a coluna Distribuição e o Dado “Quem protocolou” do Dashboard."
                : "Oculta: some a coluna, o Dado do Dashboard e o autor da protocolação no histórico."
            }
            alterado={m.distribuicao !== o.mesa.distribuicao}
          >
            <Switch checked={m.distribuicao} disabled={so} onChange={(distribuicao) => mudar({ distribuicao })} label={m.distribuicao ? "Visível" : "Oculta"} />
          </Linha>
          <Linha
            titulo="Linhas da Mesa"
            ajuda={
              m.linhas === "meus"
                ? "Só os protocolos em que a pessoa é o Responsável ou que ela protocolou (e os DFDs e itens deles) — nas listas, nos banners, nas buscas e nas gravações."
                : "Todos os protocolos das unidades que o grupo alcança."
            }
            alterado={m.linhas !== o.mesa.linhas}
          >
            <Segmented<LinhasMesa>
              value={m.linhas}
              disabled={so}
              onChange={(linhas) => mudar({ linhas })}
              ariaLabel="Linhas da Mesa"
              options={LINHAS_MESA.map((l) => ({ value: l, label: ROTULO_LINHAS[l], curto: l === "todos" ? "Todos" : undefined }))}
            />
          </Linha>
          <Linha
            titulo="Desempenho por pessoa"
            ajuda={
              semPessoas
                ? "Sem o Responsável e sem a Distribuição, não há por quem agrupar."
                : "No Dashboard da Mesa: os Dados por pessoa, a medida Ações e a tabela “Desempenho por pessoa”."
            }
            alterado={m.desempenho !== o.mesa.desempenho}
          >
            <Switch
              checked={m.desempenho}
              disabled={so || semPessoas}
              onChange={(desempenho) => mudar({ desempenho })}
              label={m.desempenho ? "Visível" : "Oculto"}
            />
          </Linha>
        </div>
      </section>

      <section aria-labelledby="det-exibicao" className="rounded-card border border-border bg-surface p-[var(--pad-card)]">
        <h4 id="det-exibicao" className="text-[14px] font-bold text-text">
          Exibição
        </h4>
        <p className="mb-1 text-[12.5px] text-muted">Como as telas abrem para este papel. Não retira acesso.</p>
        <div className="divide-y divide-border">
          <Linha
            titulo="Vínculos abertos ao abrir o banner"
            ajuda="No Orçamento do PCA, o banner de vínculos da linha já abre com cada unidade expandida. Vale também para o Administrador."
            alterado={v.exibicao.vinculosExpandidos !== o.exibicao.vinculosExpandidos}
          >
            <Switch
              checked={v.exibicao.vinculosExpandidos}
              disabled={so}
              onChange={(vinculosExpandidos) => onChange?.({ ...v, exibicao: { vinculosExpandidos } })}
              label={v.exibicao.vinculosExpandidos ? "Expandidos" : "Recolhidos"}
            />
          </Linha>
        </div>
      </section>

      <section aria-labelledby="det-presenca" className="rounded-card border border-border bg-surface p-[var(--pad-card)]">
        <h4 id="det-presenca" className="text-[14px] font-bold text-text">
          Presença
        </h4>
        <div className="divide-y divide-border">
          <Linha
            titulo="Ver quem está online"
            ajuda="As fotos de quem está online no cabeçalho, o painel “Online agora” e o ponto de presença nas fotos. Desligado, a pessoa segue aparecendo para os outros e usando o chat. Vale só com a presença ligada em Configurações → Presença; o Administrador sempre vê."
            alterado={v.presenca.verOnline !== o.presenca.verOnline}
          >
            <Switch
              checked={v.presenca.verOnline}
              disabled={so}
              onChange={(verOnline) => onChange?.({ ...v, presenca: { verOnline } })}
              label={v.presenca.verOnline ? "Permitido" : "Não"}
            />
          </Linha>
        </div>
      </section>

      <SecaoComponentes valor={v} original={o} onChange={onChange} />

      {m.linhas === "meus" && (m.responsavel.alterar === "grupo" || !m.responsavel.ver) && (
        <Callout kind="info" icon={<IconInfo className="h-4 w-4" />}>
          {m.responsavel.ver
            ? "Com “Só os meus”, passar um protocolo a outra pessoa o tira da Mesa de quem passou (continua na dela se foi ela quem protocolou)."
            : "Com “Só os meus” e o Responsável oculto, a pessoa não vê quem responde pelos protocolos que ela protocolou."}
        </Callout>
      )}
    </div>
  );
}

/**
 * COMPONENTES — o controle MINUCIOSO dentro de cada tela: por aba/visão/tabela, quais ações o papel mantém (Visualizar ·
 * Manipular · Importar · Exportar · Excluir · Configurar). Só RETIRA: vale junto com a matriz Telas × Ações. Retirar
 * Visualizar retira tudo do componente. Cada tela, componente e ação com o (?) explicativo.
 */
function SecaoComponentes({ valor, original, onChange }: { valor: DetalhesPapel; original: DetalhesPapel; onChange?: (d: DetalhesPapel) => void }) {
  const r = valor.componentes;
  const telas = Object.keys(CATALOGO_PAPEIS).filter((t) => componentesDaTela(t as Tela).length) as Tela[];
  const total = Object.values(r).reduce((n, l) => n + l.length, 0);
  return (
    <section aria-labelledby="det-componentes" className="rounded-card border border-border bg-surface p-[var(--pad-card)]">
      <div className="flex items-center gap-1">
        <h4 id="det-componentes" className="text-[14px] font-bold text-text">
          Componentes {total > 0 && <span className="text-[12.5px] font-medium text-muted">· {total} retirada(s)</span>}
        </h4>
        <Ajuda titulo="Componentes das telas" rotulo="Ajuda" compacta>
          <p>Escolha, dentro de cada tela, o que o papel vê e faz em cada aba, visão ou tabela.</p>
          <p className="mt-1">Ação marcada (destacada) = mantida; desmarcada = retirada. Vale só onde a matriz “Telas e ações” já libera a ação.</p>
          <p className="mt-1">Retirar “Visualizar” esconde o componente e retira todas as ações dele. O Administrador nunca é restringido.</p>
        </Ajuda>
      </div>
      <p className="mb-2 text-[12.5px] text-muted">Toque numa ação para retirar ou devolver. O (?) explica cada item.</p>
      <div className="space-y-3">
        {telas.map((t) => (
          <div key={t}>
            <p className="flex items-center gap-1 text-[12px] font-semibold uppercase tracking-wide text-muted">
              {rotuloTela(t)}
              <Ajuda titulo={rotuloTela(t)} rotulo="Ajuda" compacta>
                {Object.entries(CATALOGO_PAPEIS[t].acoes).map(([a, d]) => (
                  <p key={a} className="mt-1">
                    <strong>{ROTULO_ACAO[a as keyof typeof ROTULO_ACAO]}:</strong> {d}
                  </p>
                ))}
              </Ajuda>
            </p>
            <div className="divide-y divide-border">
              {componentesDaTela(t).map((x) => {
                const ret = new Set(r[x.chave] ?? []);
                const alterado = (original.componentes[x.chave] ?? []).join() !== (r[x.chave] ?? []).join();
                return (
                  <div key={x.chave} className={`flex flex-col gap-2 border-l-2 py-2 pl-3 sm:flex-row sm:items-center sm:justify-between ${alterado ? "border-accent" : "border-transparent"}`}>
                    <p className="flex min-w-0 items-center gap-1 text-[13.5px] font-medium text-text">
                      <span className={ret.has("visualizar") ? "text-muted line-through" : ""}>{x.rotulo}</span>
                      <Ajuda titulo={x.rotulo} rotulo="Ajuda" compacta>
                        <p>{x.descricao}</p>
                        {acoesDoComponente(x).map((a) => (
                          <p key={a} className="mt-1">
                            <strong>{ROTULO_ACAO[a]}:</strong> {x.acoes[a]}
                          </p>
                        ))}
                      </Ajuda>
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {acoesDoComponente(x).map((a) => {
                        const mantida = !ret.has(a);
                        return (
                          <button
                            key={a}
                            type="button"
                            disabled={!onChange}
                            aria-pressed={mantida}
                            title={`${x.rotulo} — ${ROTULO_ACAO[a]}: ${mantida ? "mantida (toque para retirar)" : "retirada (toque para devolver)"}. ${x.acoes[a]}`}
                            onClick={() => onChange?.(coerceDetalhes({ ...valor, componentes: alternarAcaoComponente(r, x.chave, a, !mantida) }))}
                            className={`min-h-8 rounded-chip px-2 text-[12px] font-semibold any-pointer-coarse:min-h-11 disabled:cursor-default ${
                              mantida ? "bg-accent text-[var(--sobre-escuro)]" : "bg-surface-2 text-muted line-through"
                            }`}
                          >
                            {ROTULO_ACAO[a]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
