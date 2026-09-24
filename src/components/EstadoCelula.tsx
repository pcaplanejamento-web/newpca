import type { RegrasAvaliacao } from "@/lib/avaliacao-core";
import { type ConferenciaCompacta, rotulosDivergencia } from "@/lib/catalogo-conferencia";
import { corVeredictoCatalogo, type ResumoEstado, rotuloVeredictoCatalogo, veredictoLinhaCatalogo } from "@/lib/dfd-tratamento";
import { chaveUnidade, motivoClassificacao, NAO_CADASTRADA, NAO_CLASSIFICADO, type ResultadoClassificacao, type UnidadeMedida } from "@/lib/padronizacao-core";
import { IconAlert, IconSpinner } from "./icons";

/**
 * Célula "Estado" das tabelas (DFDs, itens, protocolos) — UM componente para todas:
 * - `EstadoResumo`: aponta o problema PRINCIPAL (rótulo curto, na cor da importância) + contadores
 *   "+N" (erros em vermelho, atenções em âmbar); o `title` traz a lista completa (tooltip nativo).
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
