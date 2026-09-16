"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import {
  CATALOGO_AVALIACAO,
  CATEGORIAS_PADRAO,
  type CategoriaProtocolo,
  type ChaveAvaliacao,
  classificarAssunto,
  type Nivel,
  NIVEL_ROTULO,
  type PontoAvaliacao,
  type RegrasAvaliacao,
  type Sujeito,
  TIPO_DFD_ROTULO,
  TIPOS_DFD,
} from "@/lib/avaliacao-core";
import { Badge, type Tone } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { TextField } from "./Field";
import { inputCls, labelCls } from "./formStyles";
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
  const [categorias, setCategorias] = useState<CategoriaProtocolo[]>(
    regras.categorias?.length ? regras.categorias : CATEGORIAS_PADRAO,
  );
  const [salvando, setSalvando] = useState(false);
  const [teste, setTeste] = useState("");
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

  async function salvar() {
    setSalvando(true);
    try {
      const body: RegrasAvaliacao = { pontos, exProtocolo, exDfd, categorias };
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
      setCategorias(CATEGORIAS_PADRAO);
      toast.success("Regras restauradas ao padrão.");
    } catch {
      toast.error("Erro ao restaurar.");
    } finally {
      setSalvando(false);
    }
  }

  // Linha de um ponto (função pura de JSX — sem hooks, não é um componente aninhado).
  function linhaPonto(ponto: PontoAvaliacao, ctx: Ctx): ReactNode {
    const global = globalDe(ponto.chave, ponto.nivelPadrao);
    const soLeitura = ponto.niveisPermitidos.length === 1;
    const override = ctx.eixo === "global" ? "" : (ctx.eixo === "protocolo" ? exProtocolo : exDfd)[ctx.ctxKey]?.[ponto.chave] ?? "";
    const valor = ctx.eixo === "global" ? global : override;
    const efetivo: Nivel = ctx.eixo === "global" ? global : override === "" ? global : override;
    return (
      <div key={ponto.chave} className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border bg-surface px-3 py-2.5">
        <div className="min-w-[12rem] flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13.5px] font-semibold text-text">{ponto.rotulo}</span>
            <Badge tone={TONE_NIVEL[efetivo]}>{NIVEL_ROTULO[efetivo]}</Badge>
          </div>
          <p className="mt-0.5 text-[12px] text-muted">{ponto.descricao}</p>
        </div>
        {soLeitura ? (
          <span className="text-[12px] font-medium text-muted">
            Sempre {NIVEL_ROTULO[ponto.nivelPadrao].toLowerCase()}
          </span>
        ) : (
          <select
            aria-label={`Nível de ${ponto.rotulo}`}
            className={`${inputCls} h-[var(--h-control-sm)] max-w-[13rem]`}
            value={valor}
            onChange={(e) => {
              const v = e.target.value as Nivel | "";
              if (ctx.eixo === "global") setGlobal(ponto.chave, v as Nivel);
              else setEx(ctx.eixo, ctx.ctxKey, ponto.chave, v);
            }}
          >
            {ctx.eixo !== "global" && <option value="">Padrão ({NIVEL_ROTULO[global]})</option>}
            {ponto.niveisPermitidos.map((n) => (
              <option key={n} value={n}>
                {NIVEL_ROTULO[n]}
              </option>
            ))}
          </select>
        )}
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
        ? categorias.map((c) => ({ value: c.key, label: `Categoria: ${c.label}` }))
        : TIPOS_DFD.map((t) => ({ value: t, label: TIPO_DFD_ROTULO[t] }));
    const ctx: Ctx = ctxKey === "" ? { eixo: "global" } : { eixo, ctxKey };
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <span className={labelCls}>Aplicar a</span>
            <select
              className={`${inputCls} h-[var(--h-control-sm)] max-w-[18rem]`}
              value={ctxKey}
              onChange={(e) => setCtxKey(e.target.value)}
            >
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
              Exceção — o que não for definido aqui herda o padrão (todos).
            </p>
          )}
        </div>
        <div className="space-y-2">{lista.map((p) => linhaPonto(p, ctx))}</div>
      </div>
    );
  }

  // Editor de categorias de protocolo.
  const setCat = (i: number, patch: Partial<CategoriaProtocolo>) =>
    setCategorias((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const addCat = () =>
    setCategorias((cs) => [...cs, { key: `cat-${Date.now()}`, label: "", termos: [], ordem: cs.length + 1 }]);
  const delCat = (i: number) => setCategorias((cs) => cs.filter((_, j) => j !== i));
  const categoriaTeste = teste.trim() ? classificarAssunto(teste, categorias) : null;
  const labelTeste = categorias.find((c) => c.key === categoriaTeste)?.label ?? null;

  const painelCategorias = (
    <div className="space-y-4">
      <Callout kind="info">
        O <strong>assunto</strong> do protocolo é texto livre. Cada categoria casa por palavras-chave
        (acentos/maiúsculas ignorados); a 1ª que casar (por ordem) define a categoria usada nas exceções.
      </Callout>
      <div className="space-y-3">
        {categorias.map((c, i) => (
          <div key={c.key} className="grid grid-cols-1 gap-3 rounded-control border border-border bg-surface p-3 sm:grid-cols-[1fr_1.4fr_auto]">
            <TextField label="Nome" value={c.label} onChange={(e) => setCat(i, { label: e.target.value })} placeholder="INCLUSÃO" />
            <TextField
              label="Palavras-chave (vírgula)"
              value={c.termos.join(", ")}
              onChange={(e) => setCat(i, { termos: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
              placeholder="INCLUS, NOVO ITEM"
            />
            <div className="flex items-end">
              <Button
                variant="ghost"
                aria-label="Remover categoria"
                onClick={() => delCat(i)}
                icon={<IconTrash className="h-4 w-4" />}
                style={{ color: "var(--danger)" }}
              />
            </div>
          </div>
        ))}
      </div>
      <Button variant="secondary" onClick={addCat} icon={<IconPlus className="h-4 w-4" />}>
        Adicionar categoria
      </Button>
      <div className="rounded-control border border-border bg-surface-2 p-3">
        <span className={labelCls}>Testar classificação</span>
        <input
          className={inputCls}
          value={teste}
          onChange={(e) => setTeste(e.target.value)}
          placeholder="Ex.: INCLUSÃO - PCA 2027"
        />
        {teste.trim() && (
          <p className="mt-2 text-[12px] text-muted">
            {labelTeste ? (
              <>
                Categoria: <span className="font-semibold text-text">{labelTeste}</span>
              </>
            ) : (
              "Nenhuma categoria casou (usa o padrão global)."
            )}
          </p>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text">Avaliação</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Controle o que é <strong>fundamental</strong> (bloqueia), <strong>intermediário</strong> (só avisa),{" "}
            <strong>automático</strong> (corrige sozinho) ou <strong>ignorar</strong> — para Protocolos, DFDs e Itens,
            com exceções por tipo de DFD e por categoria de Protocolo.
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

      <div className="rounded-card border border-border bg-surface p-4 shadow-ring sm:p-5">
        <Tabs
          tabs={[
            { key: "protocolo", label: "Protocolo", content: painelSujeito("protocolo", "protocolo", ctxProto, setCtxProto) },
            { key: "dfd", label: "DFD", content: painelSujeito("dfd", "dfd", ctxDfd, setCtxDfd) },
            { key: "item", label: "Item", content: painelSujeito("item", "dfd", ctxItem, setCtxItem) },
            { key: "categorias", label: "Categorias", content: painelCategorias },
          ]}
        />
      </div>
    </div>
  );
}
