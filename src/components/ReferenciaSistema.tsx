"use client";

import { type ReactNode, useState } from "react";
import { ABAS } from "@/lib/abas";
import {
  CATALOGO_AVALIACAO,
  CATEGORIAS,
  corImportancia,
  nivelDe,
  nomeImportancia,
  type RegrasAvaliacao,
  regrasPadrao,
  TIPO_DFD_ROTULO,
  TIPOS_DFD,
} from "@/lib/avaliacao-core";
import type { PcaResumo } from "@/lib/dfd";
import {
  type EstadoDfd,
  type EstadoItem,
  type EstadoProtocolo,
  ESTADO_ITEM_ROTULO,
  ESTADO_PROTOCOLO_ROTULO,
  estadoCor,
  estadoItemCor,
  estadoProtocoloCor,
  estadoRotulo,
  SECOES_OBRIGATORIAS,
  TRATAVEIS,
} from "@/lib/dfd-tratamento";
import { DOMINIOS, type DominioLogica, LOGICAS, type LogicaRef } from "@/lib/logicas";
import { norm } from "@/lib/parse-dfd-comum";
import { TIPOS_ATO } from "@/lib/reparticao-responsaveis";
import type { Aparencia } from "@/lib/theme";
import { TOKENS_COR } from "@/lib/theme";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { SearchField } from "./Field";
import { FilterChip } from "./FilterChip";

// Tela READ-ONLY: listagem de TODAS as lógicas do sistema (rulebook interno), para a
// equipe que não lê o CLAUDE.md. Os fluxos vêm do catálogo narrativo (`logicas.ts`); os
// blocos "estruturados" são DERIVADOS dos `export const` reais (valor sempre vigente).
// Só componentes do design-system; nenhuma escrita.

function matches(l: LogicaRef, q: string): boolean {
  if (!q) return true;
  const alvo = norm([l.titulo, l.descricao, ...(l.detalhes ?? [])].join(" "));
  return alvo.includes(norm(q));
}

/** Pílula "rótulo → cor" (estados). */
function ChipCor({ label, cor }: { label: string; cor: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill border border-border px-2.5 py-0.5 text-[12px] font-medium text-text-2">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: cor }} />
      {label}
    </span>
  );
}

/** Card de bloco DERIVADO (valor vivo do código) com uma nota de origem. */
function Derivado({ titulo, nota, children }: { titulo: string; nota?: string; children: ReactNode }) {
  return (
    <div className="rounded-card border border-border bg-surface-2 p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-muted">{titulo}</span>
        <Badge tone="blue">valor vigente</Badge>
      </div>
      {children}
      {nota && <p className="mt-2 text-[11.5px] text-faint">{nota}</p>}
    </div>
  );
}

export function ReferenciaSistema({
  regras = regrasPadrao(),
  pcas = [],
  identidade,
}: {
  regras?: RegrasAvaliacao;
  pcas?: PcaResumo[];
  identidade?: Aparencia["identidade"];
}) {
  const [q, setQ] = useState("");
  const [dominio, setDominio] = useState<DominioLogica | null>(null);
  const buscando = q.trim().length > 0;

  // Blocos DERIVADOS por domínio (renderizados dos consts reais). Só sem busca ativa.
  function derivado(d: DominioLogica): ReactNode {
    if (d === "avaliacao") {
      return (
        <Derivado titulo="Importâncias vigentes por ponto" nota="Ajuste na aba Avaliação. Mostra a importância global efetiva (as exceções por tipo/categoria valem no contexto).">
          <div className="space-y-1.5">
            {CATALOGO_AVALIACAO.map((p) => {
              const n = nivelDe(regras, p.chave);
              return (
                <div key={p.chave} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[13px] text-text-2">{p.rotulo}</span>
                  <ChipCor label={nomeImportancia(regras, n)} cor={corImportancia(regras, n)} />
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {TIPOS_DFD.map((t) => (
              <span key={t} className="rounded-pill border border-border px-2 py-0.5 text-[11.5px] text-muted">
                {TIPO_DFD_ROTULO[t]}
              </span>
            ))}
            {CATEGORIAS.map((c) => (
              <span key={c.key} className="rounded-pill bg-accent-soft px-2 py-0.5 text-[11.5px] font-medium text-accent">
                {c.label}
              </span>
            ))}
          </div>
        </Derivado>
      );
    }
    if (d === "estados") {
      const estadosDfd: EstadoDfd[] = ["erro", "atencao", "editado", "regularizado", "regular", "pendente"];
      const estadosItem: EstadoItem[] = ["erro", "regular"];
      const estadosProto: EstadoProtocolo[] = ["erro", "atencao", "regular"];
      return (
        <Derivado titulo="Estados e cores">
          <p className="mb-1 text-[12px] font-semibold text-muted">DFD</p>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {estadosDfd.map((e) => (
              <ChipCor key={e} label={estadoRotulo(e, regras)} cor={estadoCor(e, regras)} />
            ))}
          </div>
          <p className="mb-1 text-[12px] font-semibold text-muted">Item</p>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {estadosItem.map((e) => (
              <ChipCor key={e} label={ESTADO_ITEM_ROTULO[e]} cor={estadoItemCor(e, regras)} />
            ))}
          </div>
          <p className="mb-1 text-[12px] font-semibold text-muted">Protocolo (estado = capa + problemas dos DFDs e itens)</p>
          <div className="flex flex-wrap gap-1.5">
            {estadosProto.map((e) => (
              <ChipCor key={e} label={ESTADO_PROTOCOLO_ROTULO[e]} cor={estadoProtocoloCor(e, regras)} />
            ))}
          </div>
          <p className="mt-2 text-[12px] text-muted">
            A <strong className="text-text-2">Situação</strong> do protocolo é de gestão — só as cadastradas na aba Situações.
          </p>
          <p className="mt-3 text-[12px] text-muted">
            Responsável temporário: <strong className="text-text-2">Agendado · Vigente · Encerrado</strong>.
          </p>
        </Derivado>
      );
    }
    if (d === "importacao" || d === "normalizacao") {
      const secoes = d === "importacao";
      return secoes ? (
        <Derivado titulo="Seções obrigatórias do DFD" nota="Ajuste as importâncias na aba Avaliação.">
          <div className="space-y-1.5">
            {SECOES_OBRIGATORIAS.map((s) => {
              const n = nivelDe(regras, s.chave);
              return (
                <div key={s.chave} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[13px] text-text-2">{s.rotulo}</span>
                  <ChipCor label={nomeImportancia(regras, n)} cor={corImportancia(regras, n)} />
                </div>
              );
            })}
          </div>
        </Derivado>
      ) : (
        <Derivado titulo="Seções normalizadas automaticamente">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {TRATAVEIS.map((t) => (
              <span key={t.campo} className="rounded-pill border border-border px-2.5 py-0.5 text-[12px] text-text-2">
                §{t.numero} {t.titulo}
              </span>
            ))}
          </div>
          <p className="text-[12px] text-muted">
            Prioridade → <strong className="text-text-2">ALTA / MÉDIA / BAIXA</strong>. Previsão → uma data{" "}
            <strong className="text-text-2">MÊS/AAAA</strong> OU recorrente <strong className="text-text-2">ANUAL</strong>.
            Conciliação de valores com tolerância de <strong className="text-text-2">1 centavo</strong>.
          </p>
        </Derivado>
      );
    }
    if (d === "assinatura") {
      return (
        <Derivado titulo="Atos de nomeação aceitos">
          <div className="flex flex-wrap gap-1.5">
            {TIPOS_ATO.map((a) => (
              <span key={a.valor} className="rounded-pill border border-border px-2.5 py-0.5 text-[12px] text-text-2">
                {a.rotulo}
              </span>
            ))}
          </div>
        </Derivado>
      );
    }
    if (d === "pca") {
      const ativo = pcas.find((p) => p.ativo);
      return (
        <Derivado titulo="PCAs cadastrados" nota="Cadastre e marque o vigente na aba PCAs.">
          <p className="text-[13px] text-text-2">
            {pcas.length} PCA{pcas.length === 1 ? "" : "s"} cadastrado{pcas.length === 1 ? "" : "s"}.{" "}
            {ativo ? (
              <>
                Vigente: <strong className="text-text">{ativo.nome}</strong>
                {ativo.ano ? ` (${ativo.ano})` : ""}.
              </>
            ) : (
              "Nenhum marcado como vigente."
            )}
          </p>
        </Derivado>
      );
    }
    if (d === "acesso") {
      return (
        <Derivado titulo="Abas, papéis e status">
          <p className="mb-1 text-[12px] font-semibold text-muted">Abas de módulo</p>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {ABAS.map((a) => (
              <span key={a.key} className="rounded-pill border border-border px-2.5 py-0.5 text-[12px] text-text-2">
                {a.label}
              </span>
            ))}
          </div>
          <p className="text-[12px] text-muted">
            Papéis: <strong className="text-text-2">Administrador · Gestor · Membro</strong>. Status do usuário:{" "}
            <strong className="text-text-2">Ativo · Pendente · Inativo</strong>.
          </p>
        </Derivado>
      );
    }
    if (d === "identidade") {
      const nome = identidade?.nome?.trim();
      const sub = identidade?.subtitulo?.trim();
      return (
        <Derivado titulo="Identidade atual do site" nota="Ajuste nas abas Identidade e Aparência.">
          <p className="text-[13px] text-text-2">
            Nome: <strong className="text-text">{nome || "Plataforma PCA (padrão)"}</strong>
            {" · "}Subtítulo: <strong className="text-text">{sub || "padrão"}</strong>
            {" · "}Favicon: <strong className="text-text">{identidade?.favicon ? "personalizado" : "padrão (RV)"}</strong>.
          </p>
          <p className="mt-2 text-[12px] text-muted">
            {TOKENS_COR.length} tokens de cor personalizáveis (claro/escuro).
          </p>
        </Derivado>
      );
    }
    return null;
  }

  const domsVisiveis = DOMINIOS.filter((d) => !dominio || d.key === dominio);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-text">Referência do sistema</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Todas as regras e comportamentos do sistema em um só lugar (somente leitura). O que
          bloqueia, o que só avisa, o que é automático, os estados e os fluxos — com os valores
          vigentes.
        </p>
      </div>

      <div className="space-y-3">
        <SearchField
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onClear={() => setQ("")}
          placeholder="Buscar uma regra ou comportamento…"
          aria-label="Buscar regra"
        />
        <div className="flex flex-wrap gap-1.5">
          <FilterChip label="Todos" active={dominio === null} onClick={() => setDominio(null)} />
          {DOMINIOS.map((d) => (
            <FilterChip key={d.key} label={d.label} active={dominio === d.key} onClick={() => setDominio(d.key)} />
          ))}
        </div>
      </div>

      {domsVisiveis.map((d) => {
        const cards = LOGICAS.filter((l) => l.dominio === d.key && matches(l, q));
        const bloco = buscando ? null : derivado(d.key);
        if (cards.length === 0 && !bloco) return null;
        return (
          <section key={d.key} className="space-y-3">
            <div>
              <h3 className="text-sm font-bold text-text">{d.label}</h3>
              <p className="text-[12.5px] text-muted">{d.resumo}</p>
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {cards.map((l) => (
                <div key={l.id} className="rounded-card border border-border bg-surface p-4 shadow-ring">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-text">{l.titulo}</span>
                    {l.tecnico && <Badge tone="slate">Técnico</Badge>}
                  </div>
                  <p className="mt-1 text-[13px] text-text-2">{l.descricao}</p>
                  {l.detalhes && l.detalhes.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {l.detalhes.map((det) => (
                        <li key={det} className="flex gap-1.5 text-[12.5px] text-muted">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted" />
                          {det}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    {l.fonte ? <span className="font-mono text-[11px] text-faint">{l.fonte}</span> : <span />}
                    {l.configuravelEm &&
                      (l.configuravelEm.href ? (
                        <Button variant="ghost" href={l.configuravelEm.href}>
                          Ajustar em: {l.configuravelEm.rotulo}
                        </Button>
                      ) : (
                        <span className="text-[11.5px] text-muted">Ajuste na aba {l.configuravelEm.rotulo}</span>
                      ))}
                  </div>
                </div>
              ))}
            </div>
            {bloco}
          </section>
        );
      })}

      {domsVisiveis.every((d) => LOGICAS.filter((l) => l.dominio === d.key && matches(l, q)).length === 0) &&
        buscando && (
          <Callout kind="info">Nenhuma regra encontrada para “{q}”. Tente outros termos.</Callout>
        )}
    </div>
  );
}
