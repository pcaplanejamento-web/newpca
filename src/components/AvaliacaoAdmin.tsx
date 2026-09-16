"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import {
  CATALOGO_AVALIACAO,
  CATEGORIAS,
  type ChaveAvaliacao,
  type Nivel,
  NIVEL_ROTULO,
  type PontoAvaliacao,
  type RegrasAvaliacao,
  type SinonimoRegra,
  type Sujeito,
  TIPO_DFD_ROTULO,
  TIPOS_DFD,
} from "@/lib/avaliacao-core";
import { Badge, type Tone } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { Checkbox, TextField } from "./Field";
import { labelCls, selectCls } from "./formStyles";
import { IconPlus, IconTrash } from "./icons";
import { Tabs } from "./Tabs";
import { toast } from "./Toast";

// Tela do ADM para controlar TODA avaliação de Protocolos/DFDs/Itens (spec). Só
// componentes do design-system. Recebe as regras por props (server component da rota)
// e grava o objeto inteiro em /api/admin/avaliacao. O catálogo é a fonte única dos pontos.

const TONE_NIVEL: Record<Nivel, Tone> = {
  fundamental: "red",
  intermediario: "amber",
  automatico: "blue",
  ignorar: "slate",
};

type ExMap = Record<string, Partial<Record<ChaveAvaliacao, Nivel>>>;
type Ctx = { eixo: "global" } | { eixo: "protocolo" | "dfd"; ctxKey: string };

export function AvaliacaoAdmin({ regras }: { regras: RegrasAvaliacao }) {
  const router = useRouter();
  const [pontos, setPontos] = useState<Partial<Record<ChaveAvaliacao, Nivel>>>(regras.pontos ?? {});
  const [exProtocolo, setExProtocolo] = useState<ExMap>(regras.exProtocolo ?? {});
  const [exDfd, setExDfd] = useState<ExMap>(regras.exDfd ?? {});
  const [editaveis, setEditaveis] = useState<Partial<Record<ChaveAvaliacao, boolean>>>(regras.editaveis ?? {});
  const [sinonimos, setSinonimos] = useState<Partial<Record<ChaveAvaliacao, SinonimoRegra[]>>>(regras.sinonimos ?? {});
  const [salvando, setSalvando] = useState(false);
  // Contexto ativo por painel (Todos = ""). Estado no topo (evita componente aninhado).
  const [ctxProto, setCtxProto] = useState("");
  const [ctxDfd, setCtxDfd] = useState("");
  const [ctxItem, setCtxItem] = useState("");

  const globalDe = (chave: ChaveAvaliacao, padrao: Nivel): Nivel => pontos[chave] ?? padrao;

  function setGlobal(chave: ChaveAvaliacao, nivel: Nivel) {
    setPontos((p) => ({ ...p, [chave]: nivel }));
  }
  function setEx(eixo: "protocolo" | "dfd", ctxKey: string, chave: ChaveAvaliacao, nivel: Nivel | "") {
    const setter = eixo === "protocolo" ? setExProtocolo : setExDfd;
    setter((prev) => {
      const ctx = { ...(prev[ctxKey] ?? {}) };
      if (nivel === "") delete ctx[chave];
      else ctx[chave] = nivel;
      const novo = { ...prev };
      if (Object.keys(ctx).length === 0) delete novo[ctxKey];
      else novo[ctxKey] = ctx;
      return novo;
    });
  }
  const setEditavel = (chave: ChaveAvaliacao, v: boolean) => setEditaveis((e) => ({ ...e, [chave]: v }));
  const setSinRegras = (chave: ChaveAvaliacao, regrasSin: SinonimoRegra[]) =>
    setSinonimos((s) => ({ ...s, [chave]: regrasSin }));

  async function salvar() {
    setSalvando(true);
    try {
      const body: RegrasAvaliacao = { pontos, exProtocolo, exDfd, editaveis, sinonimos };
      const res = await fetch("/api/admin/avaliacao", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Erro ao salvar.");
      toast.success("Regras de avaliação salvas — já valem para todos.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function restaurar() {
    if (!confirm("Restaurar TODAS as regras de avaliação para o padrão? As personalizações atuais serão perdidas.")) return;
    setSalvando(true);
    try {
      const res = await fetch("/api/admin/avaliacao", { method: "DELETE" });
      if (!res.ok) throw new Error();
      setPontos({});
      setExProtocolo({});
      setExDfd({});
      setEditaveis({});
      setSinonimos({});
      toast.success("Regras restauradas ao padrão.");
    } catch {
      toast.error("Erro ao restaurar.");
    } finally {
      setSalvando(false);
    }
  }

  // Editor de palavras-chave (ajuste automático) de um ponto.
  function editorSinonimos(chave: ChaveAvaliacao): ReactNode {
    const lista = sinonimos[chave] ?? [];
    const setRegra = (i: number, patch: Partial<SinonimoRegra>) =>
      setSinRegras(chave, lista.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    return (
      <div className="mt-3 rounded-control border border-border bg-surface-2 p-3">
        <p className="mb-2 text-[12px] font-semibold text-muted">
          Ajuste automático — se o texto contiver uma palavra-chave, o sistema troca a seção inteira pelo texto final.
        </p>
        <div className="space-y-2">
          {lista.map((r, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <TextField
                aria-label="Palavras-chave"
                value={r.termos.join(", ")}
                onChange={(e) => setRegra(i, { termos: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
                placeholder="Palavras-chave (vírgula)"
              />
              <TextField
                aria-label="Texto final"
                value={r.valor}
                onChange={(e) => setRegra(i, { valor: e.target.value })}
                placeholder="Vira este texto"
              />
              <div className="flex items-center">
                <Button
                  variant="ghost"
                  aria-label="Remover regra"
                  onClick={() => setSinRegras(chave, lista.filter((_, j) => j !== i))}
                  icon={<IconTrash className="h-4 w-4" />}
                  style={{ color: "var(--danger)" }}
                />
              </div>
            </div>
          ))}
        </div>
        <Button
          variant="secondary"
          className="mt-2"
          icon={<IconPlus className="h-4 w-4" />}
          onClick={() => setSinRegras(chave, [...lista, { termos: [], valor: "" }])}
        >
          Adicionar palavra-chave
        </Button>
      </div>
    );
  }

  // Card de um ponto (nível + edição + ajuste automático). Sem hooks (não é componente).
  function cardPonto(ponto: PontoAvaliacao, ctx: Ctx): ReactNode {
    const global = globalDe(ponto.chave, ponto.nivelPadrao);
    const soLeitura = ponto.niveisPermitidos.length === 1;
    const override = ctx.eixo === "global" ? "" : (ctx.eixo === "protocolo" ? exProtocolo : exDfd)[ctx.ctxKey]?.[ponto.chave] ?? "";
    const valor = ctx.eixo === "global" ? global : override;
    const efetivo: Nivel = ctx.eixo === "global" ? global : override === "" ? global : override;
    const ehGlobal = ctx.eixo === "global";
    const editavelAtual = editaveis[ponto.chave] ?? ponto.editavelPadrao ?? true;
    return (
      <div key={ponto.chave} className="rounded-control border border-border bg-surface px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-[12rem] flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[13.5px] font-semibold text-text">{ponto.rotulo}</span>
              <Badge tone={TONE_NIVEL[efetivo]}>{NIVEL_ROTULO[efetivo]}</Badge>
            </div>
            <p className="mt-0.5 text-[12px] text-muted">{ponto.descricao}</p>
          </div>
          {soLeitura ? (
            <span className="text-[12px] font-medium text-muted">Sempre {NIVEL_ROTULO[ponto.nivelPadrao].toLowerCase()}</span>
          ) : (
            <select
              aria-label={`Nível de ${ponto.rotulo}`}
              className={`${selectCls} min-w-[9rem]`}
              value={valor}
              onChange={(e) => {
                const v = e.target.value as Nivel | "";
                if (ctx.eixo === "global") setGlobal(ponto.chave, v as Nivel);
                else setEx(ctx.eixo, ctx.ctxKey, ponto.chave, v);
              }}
            >
              {!ehGlobal && <option value="">Padrão ({NIVEL_ROTULO[global]})</option>}
              {ponto.niveisPermitidos.map((n) => (
                <option key={n} value={n}>
                  {NIVEL_ROTULO[n]}
                </option>
              ))}
            </select>
          )}
        </div>
        {/* Edição/ajuste automático são GLOBAIS (só no contexto "Todos"). */}
        {ehGlobal && ponto.suportaEdicao && (
          <div className="mt-2">
            <Checkbox
              label="Editável pelo usuário na análise"
              checked={editavelAtual}
              onChange={(e) => setEditavel(ponto.chave, e.target.checked)}
            />
          </div>
        )}
        {ehGlobal && ponto.suportaAuto && efetivo === "automatico" && editorSinonimos(ponto.chave)}
      </div>
    );
  }

  // Painel de um sujeito com seletor de contexto (Todos / categoria / tipo de DFD).
  function painelSujeito(
    sujeito: Sujeito,
    eixo: "protocolo" | "dfd",
    ctxKey: string,
    setCtxKey: (v: string) => void,
  ): ReactNode {
    const lista = CATALOGO_AVALIACAO.filter((p) => p.sujeito === sujeito);
    const opcoes =
      eixo === "protocolo"
        ? CATEGORIAS.map((c) => ({ value: c.key, label: `Categoria: ${c.label}` }))
        : TIPOS_DFD.map((t) => ({ value: t, label: TIPO_DFD_ROTULO[t] }));
    const ctx: Ctx = ctxKey === "" ? { eixo: "global" } : { eixo, ctxKey };
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <span className={labelCls}>Aplicar a</span>
            <select className={`${selectCls} min-w-[16rem]`} value={ctxKey} onChange={(e) => setCtxKey(e.target.value)}>
              <option value="">Padrão (todos)</option>
              {opcoes.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          {ctxKey !== "" && (
            <p className="pb-2 text-[12px] text-muted">
              Exceção de nível — o que não for definido aqui herda o padrão (todos). Edição e ajuste
              automático são definidos no &quot;Padrão (todos)&quot;.
            </p>
          )}
        </div>
        <div className="space-y-2">{lista.map((p) => cardPonto(p, ctx))}</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text">Avaliação</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Controle total de importação de DFD, correção de itens e protocolação. Para cada dado defina o nível —{" "}
            <strong>fundamental</strong> (bloqueia), <strong>intermediário</strong> (só avisa),{" "}
            <strong>automático</strong> (corrige sozinho) ou <strong>ignorar</strong> —, se o usuário pode editá-lo na
            análise, e as palavras-chave do ajuste automático. Com exceções por tipo de DFD e por categoria de protocolo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={restaurar} disabled={salvando}>
            Restaurar padrão
          </Button>
          <Button onClick={salvar} loading={salvando}>
            Salvar
          </Button>
        </div>
      </div>

      <Callout kind="info">
        As <strong>categorias de protocolo</strong> (INCLUSÃO, EXCLUSÃO, ALTERAÇÃO NÃO ONEROSA) e os{" "}
        <strong>tipos de DFD</strong> (DFD-S/R/O/E) são fixos.
      </Callout>

      <div className="rounded-card border border-border bg-surface p-4 shadow-ring sm:p-5">
        <Tabs
          tabs={[
            { key: "protocolo", label: "Protocolo", content: painelSujeito("protocolo", "protocolo", ctxProto, setCtxProto) },
            { key: "dfd", label: "DFD", content: painelSujeito("dfd", "dfd", ctxDfd, setCtxDfd) },
            { key: "item", label: "Item", content: painelSujeito("item", "dfd", ctxItem, setCtxItem) },
          ]}
        />
      </div>
    </div>
  );
}
