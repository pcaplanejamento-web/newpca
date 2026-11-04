"use client";

import type { RegrasAvaliacao } from "@/lib/avaliacao-core";
import { type ConferenciaCompacta, rotulosDivergencia } from "@/lib/catalogo-conferencia";
import { corVeredictoCatalogo, type ResumoEstado, rotuloVeredictoCatalogo, veredictoLinhaCatalogo } from "@/lib/dfd-tratamento";
import { chaveUnidade, motivoClassificacao, NAO_CADASTRADA, NAO_CLASSIFICADO, type ResultadoClassificacao, type UnidadeMedida } from "@/lib/padronizacao-core";
import { useDadosCompletos } from "./DadosCompletos";
import { IconAlert, IconSpinner } from "./icons";

/**
 * Célula "Estado" das tabelas (DFDs, itens, protocolos) — UM componente para todas:
 * - `EstadoResumo`: aponta o problema PRINCIPAL (rótulo curto, na cor da importância) + contadores
 *   "+N" (erros em vermelho, atenções em âmbar); o `title` traz a lista completa (tooltip nativo). Com os DADOS
 *   COMPLETOS ligados (`DadosCompletos`), todos os problemas na própria célula.
 * - `EstadoPonto`: ponto + rótulo simples (Regular/Editado/Leitura incompleta/Atenção…).
 * - `EstadoProcessando`: spinner + o que está acontecendo ("Conferindo…", "Lendo o DFD…", "Na fila").
 * - `CelulaCatalogo`: a coluna "Catálogo" dos itens (Conforme / Fora do catálogo / Divergente / Tipo incompatível),
 *   na cor do nível do ADM e com o detalhe específico no `title`; sem veredito = "—".
 * - `CelulaClassificacao`: a classificação AUTOMÁTICA do item (ponto na cor da classificação; o motivo no `title`).
 * - `CelulaUnidadeCadastrada`: a unidade de medida CADASTRADA que a unidade do item representa (a sigla) ou
 *   "Não cadastrada" em âmbar; item sem unidade = "—".
 * Sem quebra de linha (a coluna ganha a largura do conteúdo).
 */
export function EstadoResumo({ res }: { res: ResumoEstado }) {
  // DADOS COMPLETOS: TODOS os problemas na célula (o principal na cor da importância; os demais a seguir).
  const completo = useDadosCompletos();
  const outros = completo ? res.rotulos.filter((r) => r !== res.rotulo) : [];
  if (outros.length > 0)
    return (
      <span className="inline-flex max-w-[22rem] flex-wrap items-center justify-center gap-x-1 whitespace-normal text-[12px] font-medium" title={res.titulo || undefined}>
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: res.cor }} />
        <span style={{ color: res.cor }}>{res.rotulo}</span>
        {outros.map((r) => (
          <span key={r} className="text-text-2">
            · {r}
          </span>
        ))}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-[12px] font-medium" title={res.titulo || undefined}>
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: res.cor }} />
      <span style={{ color: res.cor }}>{res.rotulo}</span>
      {res.extraErros > 0 && (
        <span className="font-bold" style={{ color: "var(--danger)" }}>
          +{res.extraErros}
        </span>
      )}
      {res.extraAtencoes > 0 && (
        <span className="font-bold" style={{ color: "var(--warn)" }}>
          +{res.extraAtencoes}
        </span>
      )}
    </span>
  );
}

export function EstadoPonto({ cor, rotulo, title }: { cor: string; rotulo: string; title?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] font-medium" style={{ color: cor }} title={title}>
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: cor }} />
      {rotulo}
    </span>
  );
}

/** Linha em processamento (conferência/leitura em andamento): spinner + o que está acontecendo. */
export function EstadoProcessando({ rotulo, fila = false }: { rotulo: string; fila?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] font-medium text-muted" aria-live="polite">
      <IconSpinner className="h-3.5 w-3.5 shrink-0" style={{ color: fila ? "var(--faint)" : "var(--accent)" }} />
      {rotulo}
    </span>
  );
}

/** Célula "Catálogo" de um item — a MESMA na tabela de itens do DFD e na visão Itens da Mesa. */
export function CelulaCatalogo({ conf, regras, dfdTipo }: { conf: ConferenciaCompacta | null | undefined; regras: RegrasAvaliacao; dfdTipo: string | null }) {
  const v = veredictoLinhaCatalogo(conf, regras, dfdTipo);
  if (!v || !conf) return <span className="text-muted">—</span>;
  const espec = rotulosDivergencia(conf).join(" · ");
  return <EstadoPonto cor={corVeredictoCatalogo(v.nivel)} rotulo={rotuloVeredictoCatalogo(v)} title={espec || undefined} />;
}

export function CelulaClassificacao({ resultado }: { resultado: ResultadoClassificacao | null }) {
  if (!resultado) return <span className="whitespace-nowrap text-[12px] text-faint" title={motivoClassificacao(null)}>{NAO_CLASSIFICADO}</span>;
  return <EstadoPonto cor={resultado.classificacao.cor} rotulo={resultado.classificacao.nome} title={motivoClassificacao(resultado)} />;
}

export function CelulaUnidadeCadastrada({ texto, unidade }: { texto: string | null | undefined; unidade: UnidadeMedida | null }) {
  if (!chaveUnidade(texto)) return <span className="text-faint">—</span>;
  if (!unidade)
    return (
      <span
        className="inline-flex items-center gap-1 whitespace-nowrap text-[12px] font-medium"
        style={{ color: "var(--warn)" }}
        title={`A unidade “${texto}” não está cadastrada (Catálogo → Unidades de medida).`}
      >
        <IconAlert className="h-3.5 w-3.5 shrink-0" />
        {NAO_CADASTRADA}
      </span>
    );
  return (
    <span className="font-mono text-[12px] font-semibold text-text" title={`${unidade.sigla} — ${unidade.nome}`}>
      {unidade.sigla}
    </span>
  );
}

/** O CENTRO DE CUSTO da Centi do DFD (a coluna das tabelas de DFDs e Itens): o texto (uma linha, o inteiro na dica — ou na
 * célula com os dados completos) ou "Sem centro de custo" na cor da importância do ADM (`dfd.centroCusto`). */
export function CelulaCentroCusto({ centro, cor = "var(--danger)" }: { centro: string | null | undefined; cor?: string }) {
  const completo = useDadosCompletos();
  if (!centro?.trim())
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-[12px] font-medium" style={{ color: cor }} title="Execute a automação “Unidades dos DFDs × Centro de Custo” para gravar o centro de custo da Centi.">
        <IconAlert className="h-3.5 w-3.5 shrink-0" />
        Sem centro de custo
      </span>
    );
  return completo ? (
    <span className="block whitespace-normal break-words text-left text-[12px]">{centro}</span>
  ) : (
    <span className="line-clamp-1 text-left text-[12px] text-text-2" title={centro}>
      {centro}
    </span>
  );
}

/** A SUBUNIDADE efetiva do DFD (`subunidadeDoDfd`): o nome, "Não definida" na cor da importância (`dfd.subunidade`) ou
 * "—" (DFD sem unidade). */
/** Os dois "sem subunidade" — opções SEPARADAS no filtro: o ERRO (o cadastro não define) × o EM BRANCO (o DFD ainda sem
 * centro de custo ou sem unidade — a falta é de outro ponto). A célula mostra o MESMO texto do filtro. */
export const SUB_NAO_DEFINIDA = "Não definida";
export const SUB_EM_BRANCO = "Em branco";

export function CelulaSubunidade({ nome, falta, cor = "var(--warn)", dica }: { nome: string | null; falta: boolean; cor?: string; dica?: string }) {
  if (nome)
    return (
      <span className="whitespace-nowrap font-mono text-[12px] font-semibold text-text" title={dica ?? nome}>
        {nome}
      </span>
    );
  if (!falta)
    return (
      <span className="whitespace-nowrap text-[12px] text-faint" title="Sem centro de custo gravado (ou sem unidade) — a subunidade sai dele">
        {SUB_EM_BRANCO}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-[12px] font-medium" style={{ color: cor }} title={dica}>
      <IconAlert className="h-3.5 w-3.5 shrink-0" />
      {SUB_NAO_DEFINIDA}
    </span>
  );
}
