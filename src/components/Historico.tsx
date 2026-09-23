"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type AcaoAuditoria,
  type AlteracaoHistorico,
  agruparHistorico,
  contarAlteracao,
  type FiltroHistorico,
  historicoDoItem,
  interpretarAlteracao,
  type LinhaHistorico,
  type OrigemAuditoria,
  passaFiltroHistorico,
  ROTULO_ACAO,
  ROTULO_FILTRO_HISTORICO,
  ROTULO_ORIGEM,
  resumoCurtoAlteracao,
  rotuloAlvo,
} from "@/lib/auditoria-core";
import { dataHoraBR, num } from "@/lib/format";
import { Badge, type Tone } from "./Badge";
import { Callout } from "./Callout";
import { BlocoDiff, DiffItem, DiffLinha } from "./ComparacaoReenvio";
import { IconAlert, IconChevronDown, IconClock, IconLayers, IconUser } from "./icons";
import { Segmented } from "./Segmented";
import { SkeletonLinhas } from "./Skeleton";

/** Cor (token) por ação — verde = criar/importar, azul = editar, vermelho = excluir. */
const COR_ACAO: Record<string, string> = {
  criar: "var(--ok)",
  importar: "var(--ok)",
  protocolar: "var(--ok)",
  cadastro: "var(--ok)",
  aprovar: "var(--ok)",
  editar: "var(--info)",
  login: "var(--muted)",
  logout: "var(--muted)",
  excluir: "var(--danger)",
};
/** Tom do selo de ORIGEM (o canal da alteração). */
const TOM_ORIGEM: Record<OrigemAuditoria, Tone> = {
  protocolacao: "emerald",
  reenvio: "violet",
  avulso: "cyan",
  banner: "blue",
  massa: "orange",
  celula: "slate",
  vinculo: "amber",
  exclusao: "red",
};
const ROTULOS_HISTORICO = ["Antes", "Depois"] as const;
const FILTROS: FiltroHistorico[] = ["tudo", "capa", "dfds", "itens"];
/** Alterações de um evento mostradas de início (o resto em "Ver mais"). */
const VISIVEIS = 8;

/** Onde o histórico é mostrado: a tela ADM (global), o banner do PROTOCOLO, o do DFD ou o do ITEM. */
export type EscopoHistorico = "global" | "protocolo" | "dfd" | "item";
type Linha = LinhaHistorico & { alt: AlteracaoHistorico };

/** Carrega um histórico (GET `{ ok, historico }`) — `url` nula = nada carregado; refaz ao trocar a url. */
export function useHistorico(url: string | null): { linhas: LinhaHistorico[] | null; erro: string | null } {
  const [estado, setEstado] = useState<{ url: string; linhas: LinhaHistorico[]; erro: string | null } | null>(null);
  useEffect(() => {
    setEstado(null);
    if (!url) return;
    const ac = new AbortController();
    fetch(url, { signal: ac.signal })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; historico?: LinhaHistorico[] };
        if (ac.signal.aborted) return;
        setEstado(r.ok && j.ok ? { url, linhas: j.historico ?? [], erro: null } : { url, linhas: [], erro: j.error ?? "Não foi possível carregar o histórico." });
      })
      .catch(() => {
        if (!ac.signal.aborted) setEstado({ url, linhas: [], erro: "Sem conexão com o servidor — tente novamente." });
      });
    return () => ac.abort();
  }, [url]);
  // Resposta de OUTRA url (a anterior) nunca aparece: até a nova chegar, é "carregando".
  return estado && estado.url === url ? { linhas: estado.linhas, erro: estado.erro } : { linhas: null, erro: null };
}

/**
 * HISTÓRICO de alterações — timeline por EVENTO: quem, quando, por qual CANAL (selo de origem:
 * protocolação, reenvio, edição no banner, em massa, na tabela…), por qual PROTOCOLO e O QUE mudou
 * (dados, seções, assinaturas e itens — antes → depois, recolhível). Escopos:
 * - `global` (tela ADM): uma linha por evento, qualquer entidade;
 * - `protocolo`: as alterações da capa + as dos DFDs/itens que passaram por ele, AGRUPADAS por evento
 *   (um "Salvar alterações", uma protocolação ou uma edição em massa = um cartão) + filtro Tudo/Capa/DFDs/Itens;
 * - `dfd`: as alterações do DFD (com o protocolo de origem de cada uma);
 * - `item`: só o que tocou AQUELE item (e a importação por onde ele entrou).
 * Os dados vêm interpretados pelo núcleo puro (`interpretarAlteracao`, formato novo e legado).
 */
export function Historico({
  entradas,
  vazio = "Sem histórico de alterações.",
  carregando = false,
  erro = null,
  escopo = "global",
  protocoloId = null,
  item = null,
}: {
  entradas: LinhaHistorico[];
  vazio?: string;
  carregando?: boolean;
  erro?: string | null;
  escopo?: EscopoHistorico;
  /** (escopo protocolo) o protocolo aberto — o selo "via protocolo" some quando é ele mesmo. */
  protocoloId?: number | null;
  /** (escopo item) o item: nº no DFD + código. */
  item?: { item: number | null; codigo: string | null } | null;
}) {
  const [filtro, setFiltro] = useState<FiltroHistorico>("tudo");
  const linhas = useMemo<Linha[]>(() => entradas.map((l) => ({ ...l, alt: interpretarAlteracao(l) })), [entradas]);
  // O alvo do item é (nº, código) — valores estáveis entre renders (o objeto `item` pode ser novo a cada um).
  const doItemAtivo = escopo === "item" && item != null;
  const alvoItem = item?.item ?? null;
  const alvoCodigo = item?.codigo ?? null;
  const doItem = useMemo(
    () => (doItemAtivo ? historicoDoItem(entradas, { item: alvoItem, codigo: alvoCodigo }) : []),
    [doItemAtivo, entradas, alvoItem, alvoCodigo],
  );

  if (erro)
    return (
      <Callout kind="danger" icon={<IconAlert className="h-4 w-4" />}>
        {erro}
      </Callout>
    );
  if (carregando) return <SkeletonLinhas linhas={4} />;

  if (escopo === "item") {
    if (doItem.length === 0) return <p className="text-sm text-muted">{vazio}</p>;
    return (
      <ul className="space-y-2">
        {doItem.map(({ linha, alteracao, item: dif }) => (
          <li key={linha.id} className="rounded-card border border-border bg-surface p-3 shadow-ring">
            <Meta l={linha} escopo="item" protocoloId={null} />
            <div className="mt-2 space-y-1.5">
              {dif ? (
                <DiffItem it={dif} rotulos={ROTULOS_HISTORICO} compacto />
              ) : (
                <p className="text-[12.5px] text-text-2">
                  <span className="font-semibold" style={{ color: COR_ACAO.importar }}>
                    Importação do DFD
                  </span>
                  {linha.resumo ? ` — ${linha.resumo}` : ""}
                </p>
              )}
              {alteracao.obs.map((o) => (
                <p key={o} className="text-[12px] text-muted">
                  {o}
                </p>
              ))}
            </div>
          </li>
        ))}
      </ul>
    );
  }

  const contagem: Record<FiltroHistorico, number> = { tudo: 0, capa: 0, dfds: 0, itens: 0 };
  if (escopo === "protocolo") for (const l of linhas) for (const f of FILTROS) if (passaFiltroHistorico(l, l.alt, f)) contagem[f]++;
  const filtradas = escopo === "protocolo" ? linhas.filter((l) => passaFiltroHistorico(l, l.alt, filtro)) : linhas;
  // No protocolo, um evento (mesmo usuário + canal + protocolo em sequência) vira UM cartão.
  const eventos = escopo === "protocolo" ? agruparHistorico(filtradas) : filtradas.map((l) => [l]);

  return (
    <div className="space-y-3">
      {escopo === "protocolo" && linhas.length > 0 && (
        <Segmented
          value={filtro}
          onChange={setFiltro}
          options={FILTROS.map((f) => ({ value: f, label: `${ROTULO_FILTRO_HISTORICO[f]} (${num(contagem[f])})` }))}
        />
      )}
      {eventos.length === 0 ? (
        <p className="text-sm text-muted">{linhas.length > 0 ? "Nenhuma alteração neste filtro." : vazio}</p>
      ) : (
        <ul className="space-y-2">
          {eventos.map((g) => (
            <CartaoEvento key={g[0].id} linhas={g} escopo={escopo} protocoloId={protocoloId} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** "via Protocolo X" — o protocolo por onde a alteração passou (omitido quando é redundante). */
function viaProtocolo(l: LinhaHistorico, escopo: EscopoHistorico, protocoloId: number | null): string | null {
  if (l.protocoloId == null) return null;
  if (escopo === "protocolo" && l.protocoloId === protocoloId) return null;
  if (l.entidade === "protocolo" && l.entidadeId === l.protocoloId) return null; // o alvo já é o protocolo
  return `Protocolo ${l.protocoloNumero ?? `#${l.protocoloId} (excluído)`}`;
}

/** Cabeçalho do cartão: canal (origem), protocolo, autor e data/hora (Brasília). */
function Meta({ l, escopo, protocoloId }: { l: LinhaHistorico; escopo: EscopoHistorico; protocoloId: number | null }) {
  const origem = l.origem && l.origem in ROTULO_ORIGEM ? (l.origem as OrigemAuditoria) : null;
  const via = viaProtocolo(l, escopo, protocoloId);
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-muted">
      {origem && <Badge tone={TOM_ORIGEM[origem]}>{ROTULO_ORIGEM[origem]}</Badge>}
      {via && (
        <span className="inline-flex items-center gap-1 font-semibold text-text-2" title="Protocolo por onde a alteração passou">
          <IconLayers className="h-3.5 w-3.5 shrink-0" />
          {via}
        </span>
      )}
      <span className="inline-flex min-w-0 items-center gap-1">
        <IconUser className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{l.usuarioNome ?? "Sistema"}</span>
      </span>
      <span className="inline-flex items-center gap-1 sm:ml-auto">
        <IconClock className="h-3.5 w-3.5 shrink-0" />
        {dataHoraBR(l.criadoEm)}
      </span>
    </div>
  );
}

/** UM evento (uma ou mais alterações feitas juntas) — cada alteração numa linha recolhível. */
function CartaoEvento({ linhas, escopo, protocoloId }: { linhas: Linha[]; escopo: EscopoHistorico; protocoloId: number | null }) {
  const [todas, setTodas] = useState(false);
  const unica = linhas.length === 1;
  // A capa do protocolo abre o evento (na protocolação ela é gravada ANTES dos DFDs — viria por último).
  const ordem = unica ? linhas : [...linhas.filter((l) => l.entidade === "protocolo"), ...linhas.filter((l) => l.entidade !== "protocolo")];
  const vis = todas ? ordem : ordem.slice(0, VISIVEIS);
  return (
    <li className="rounded-card border border-border bg-surface p-3 shadow-ring">
      <Meta l={linhas[0]} escopo={escopo} protocoloId={protocoloId} />
      {!unica && <p className="mt-1.5 text-[12px] font-semibold text-muted">{num(linhas.length)} alterações neste evento</p>}
      <ul className="mt-1 divide-y divide-border">
        {vis.map((l) => (
          <AlteracaoLinha key={l.id} l={l} escopo={escopo} abertaInicial={unica && escopo !== "global" && contarAlteracao(l.alt).total <= 6} />
        ))}
      </ul>
      {linhas.length > vis.length && (
        <button
          type="button"
          className="mt-1 min-h-[44px] text-[12.5px] font-medium text-accent hover:underline"
          onClick={() => setTodas(true)}
        >
          Ver mais {num(linhas.length - vis.length)} alteração(ões)
        </button>
      )}
    </li>
  );
}

/** Uma alteração: ação + alvo + o que mudou (resumo curto); abre o detalhe antes → depois. */
function AlteracaoLinha({ l, escopo, abertaInicial }: { l: Linha; escopo: EscopoHistorico; abertaInicial: boolean }) {
  const [aberta, setAberta] = useState(abertaInicial);
  const a = l.alt;
  const temDetalhe = contarAlteracao(a).total > 0 || a.obs.length > 0;
  const cor = COR_ACAO[l.acao] ?? "var(--muted)";
  // O alvo: omitido no DFD (é ele mesmo); a capa no protocolo; senão o documento (DFD n · Planej. / Protocolo n).
  const alvo =
    escopo === "dfd" && l.entidade === "dfd"
      ? null
      : escopo === "protocolo" && l.entidade === "protocolo"
        ? "Capa do protocolo"
        : rotuloAlvo(l, a);
  const oque = resumoCurtoAlteracao(a) || l.resumo || "";
  const cabeca = (
    <>
      <span className="mt-[7px] h-2 w-2 shrink-0 rounded-full" style={{ background: cor }} />
      <span className="min-w-0 flex-1">
        <span className="text-[13px]">
          <span className="font-bold" style={{ color: cor }}>
            {ROTULO_ACAO[l.acao as AcaoAuditoria] ?? l.acao}
          </span>
          {alvo && <span className="font-semibold text-text"> · {alvo}</span>}
        </span>
        {oque && <span className="block break-words text-[12.5px] text-text-2">{oque}</span>}
      </span>
      {temDetalhe && (
        <IconChevronDown className={`mt-1 h-4 w-4 shrink-0 text-muted transition-transform duration-[var(--motion-duration)] ${aberta ? "rotate-180" : ""}`} />
      )}
    </>
  );
  return (
    <li className="py-1">
      {temDetalhe ? (
        <button
          type="button"
          aria-expanded={aberta}
          onClick={() => setAberta((v) => !v)}
          className="flex min-h-[44px] w-full items-start gap-2 rounded-control px-1 py-1.5 text-left transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          {cabeca}
        </button>
      ) : (
        <div className="flex min-h-[44px] items-start gap-2 px-1 py-1.5">{cabeca}</div>
      )}
      {aberta && temDetalhe && <DetalheAlteracao a={a} />}
    </li>
  );
}

/** O detalhe de UMA alteração: dados, seções, assinaturas e itens (antes → depois) + observações. */
function DetalheAlteracao({ a }: { a: AlteracaoHistorico }) {
  const [todosItens, setTodosItens] = useState(false);
  const itens = todosItens ? a.itens : a.itens.slice(0, 30);
  return (
    <div className="mb-1.5 mt-1 space-y-3 rounded-[10px] border border-border-2 bg-surface-2 p-2.5 sm:ml-4">
      {a.campos.length > 0 && (
        <BlocoDiff titulo="Dados" qtd={a.campos.length}>
          {a.campos.map((d, k) => (
            <DiffLinha key={`${d.campo}:${k}`} d={d} rotulos={ROTULOS_HISTORICO} compacto />
          ))}
        </BlocoDiff>
      )}
      {a.secoes.length > 0 && (
        <BlocoDiff titulo="Seções" qtd={a.secoes.length}>
          {a.secoes.map((d, k) => (
            <DiffLinha key={`${d.campo}:${k}`} d={d} rotulos={ROTULOS_HISTORICO} compacto />
          ))}
        </BlocoDiff>
      )}
      {a.assinaturas && (
        <BlocoDiff titulo="Assinaturas" qtd={1}>
          <DiffLinha d={a.assinaturas} rotulos={ROTULOS_HISTORICO} compacto />
        </BlocoDiff>
      )}
      {a.itens.length > 0 && (
        <BlocoDiff titulo="Itens" qtd={a.itens.length}>
          {itens.map((it, k) => (
            <DiffItem key={`${it.tipo}:${it.item}:${it.codigo}:${k}`} it={it} rotulos={ROTULOS_HISTORICO} compacto />
          ))}
          {a.itens.length > itens.length && (
            <button
              type="button"
              className="min-h-[44px] text-[12.5px] font-medium text-accent hover:underline"
              onClick={() => setTodosItens(true)}
            >
              Ver mais {num(a.itens.length - itens.length)} item(ns)
            </button>
          )}
        </BlocoDiff>
      )}
      {a.obs.map((o) => (
        <p key={o} className="text-[12px] text-muted">
          {o}
        </p>
      ))}
    </div>
  );
}

/**
 * Seção RECOLHÍVEL "Histórico do item" (no `ItemDetalhe` de um DFD gravado): carrega o histórico do DFD
 * só ao abrir e mostra o que tocou este item — com o canal e o protocolo de cada alteração.
 */
export function HistoricoDoItem({
  dfdId,
  item,
  entradas,
}: {
  dfdId: number;
  item: { item: number | null; codigo: string | null };
  /** Histórico do DFD já carregado pelo host (sem ele, carrega ao abrir). */
  entradas?: LinhaHistorico[];
}) {
  const [aberto, setAberto] = useState(false);
  const remoto = useHistorico(aberto && !entradas ? `/api/dfd/${dfdId}/historico` : null);
  const linhas = entradas ?? remoto.linhas;
  const erro = entradas ? null : remoto.erro;
  return (
    <section className="rounded-card border border-border bg-surface shadow-ring">
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
        className="flex min-h-[44px] w-full items-center gap-2 rounded-card px-4 py-2.5 text-left transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <IconClock className="h-4 w-4 shrink-0 text-muted" />
        <span className="flex-1 text-[13px] font-bold text-text">Histórico do item</span>
        <IconChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform duration-[var(--motion-duration)] ${aberto ? "rotate-180" : ""}`} />
      </button>
      {aberto && (
        <div className="border-t border-border p-3">
          <Historico
            entradas={linhas ?? []}
            carregando={linhas === null && !erro}
            erro={erro}
            escopo="item"
            item={item}
            vazio="Nenhuma alteração registrada neste item."
          />
        </div>
      )}
    </section>
  );
}
