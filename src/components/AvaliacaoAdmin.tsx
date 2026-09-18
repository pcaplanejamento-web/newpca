"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import {
  CATALOGO_AVALIACAO,
  CATEGORIAS,
  type ChaveAvaliacao,
  type Comportamento,
  type EstadoCicloCfg,
  type EstadoCicloId,
  ESTADOS_CICLO_ORDEM,
  ESTADOS_CICLO_PADRAO,
  estadoCicloCfg,
  type Importancia,
  IMPORTANCIAS_PADRAO,
  importanciaPadraoDe,
  importanciasDe,
  type Nivel,
  type PontoAvaliacao,
  type RegrasAvaliacao,
  type SinonimoRegra,
  type Sujeito,
  TIPO_DFD_ROTULO,
  TIPOS_DFD,
} from "@/lib/avaliacao-core";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { ColorField } from "./ColorField";
import { TextField } from "./Field";
import { labelCls, selectCls } from "./formStyles";
import { IconArrowDown, IconArrowUp, IconPencil, IconPlus, IconTrash } from "./icons";
import { Modal } from "./Modal";
import { Segmented } from "./Segmented";
import { Switch } from "./Switch";
import { Tabs } from "./Tabs";
import { toast } from "./Toast";

// Tela do ADM para controlar TODA avaliação de Protocolos/DFDs/Itens (spec). Só
// componentes do design-system. Recebe as regras por props (server component da rota)
// e grava o objeto inteiro em /api/admin/avaliacao. O catálogo é a fonte única dos pontos.
// As IMPORTÂNCIAS (rigor de cada ponto) são uma lista gerenciável — nome, cor e comportamento.

const DESC_COMPORTAMENTO: Record<Comportamento, string> = {
  bloqueia: "Trava a importação/protocolação até corrigir.",
  avisa: "Só sinaliza (atenção âmbar); não bloqueia.",
  automatico: "Tenta corrigir sozinho; nunca bloqueia (onde há corretor).",
  ignora: "Não avalia este ponto.",
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
  // Importâncias (sempre com as 4 base garantidas) + estados de ciclo (rótulo/cor).
  const [importancias, setImportancias] = useState<Importancia[]>(() => importanciasDe(regras));
  const [estadosCiclo, setEstadosCiclo] = useState<Record<EstadoCicloId, EstadoCicloCfg>>(
    () =>
      Object.fromEntries(ESTADOS_CICLO_ORDEM.map((id) => [id, estadoCicloCfg(regras, id)])) as Record<
        EstadoCicloId,
        EstadoCicloCfg
      >,
  );
  const [editImp, setEditImp] = useState<Importancia | null>(null);
  const [salvando, setSalvando] = useState(false);
  // Contexto ativo por painel (Todos = ""). Estado no topo (evita componente aninhado).
  const [ctxProto, setCtxProto] = useState("");
  const [ctxDfd, setCtxDfd] = useState("");
  const [ctxItem, setCtxItem] = useState("");

  // Resolvedores da lista LOCAL (refletem edições ao vivo). Fallback seguro = "ignora".
  const impById = (id: string): Importancia =>
    importancias.find((i) => i.id === id) ??
    importancias.find((i) => i.id === "ignorar") ??
    IMPORTANCIAS_PADRAO[IMPORTANCIAS_PADRAO.length - 1];
  const opcoesDoPonto = (ponto: PontoAvaliacao) =>
    importancias.filter((i) => ponto.comportamentosPermitidos.includes(i.comportamento));

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
  const setCiclo = (id: EstadoCicloId, patch: Partial<EstadoCicloCfg>) =>
    setEstadosCiclo((s) => ({ ...s, [id]: { ...s[id], ...patch } }));

  // ---- CRUD de importâncias ----
  function novaImp() {
    const ordem = importancias.reduce((m, i) => Math.max(m, i.ordem), 0) + 1;
    setEditImp({ id: `imp-${Date.now().toString(36)}`, nome: "", cor: "#2563eb", comportamento: "avisa", ordem });
  }
  function salvarImp() {
    if (!editImp) return;
    const nome = editImp.nome.trim();
    if (!nome) return toast.error("Informe o nome da importância.");
    if (!/^#[0-9a-fA-F]{6}$/.test(editImp.cor)) return toast.error("Escolha uma cor válida (#rrggbb).");
    const imp: Importancia = { ...editImp, nome };
    setImportancias((list) => {
      const i = list.findIndex((x) => x.id === imp.id);
      if (i >= 0) {
        const n = [...list];
        n[i] = imp;
        return n;
      }
      return [...list, imp];
    });
    setEditImp(null);
  }
  function moverImp(i: number, dir: -1 | 1) {
    setImportancias((list) => {
      const j = i + dir;
      if (j < 0 || j >= list.length) return list;
      const n = [...list];
      [n[i], n[j]] = [n[j], n[i]];
      return n.map((x, k) => ({ ...x, ordem: k + 1 }));
    });
  }
  function excluirImp(imp: Importancia) {
    if (imp.builtin) return;
    if (!confirm(`Excluir a importância "${imp.nome}"? Os pontos que a usam voltam ao padrão.`)) return;
    setImportancias((list) => list.filter((x) => x.id !== imp.id).map((x, k) => ({ ...x, ordem: k + 1 })));
    // Limpa referências órfãs em pontos/exceções (a engine já tem fallback, mas mantém o blob limpo).
    const limpa = (m: Partial<Record<ChaveAvaliacao, Nivel>>) =>
      Object.fromEntries(Object.entries(m).filter(([, v]) => v !== imp.id)) as Partial<Record<ChaveAvaliacao, Nivel>>;
    const limpaEx = (m: ExMap): ExMap =>
      Object.fromEntries(
        Object.entries(m)
          .map(([k, v]) => [k, limpa(v)] as const)
          .filter(([, v]) => Object.keys(v).length > 0),
      ) as ExMap;
    setPontos((p) => limpa(p));
    setExProtocolo((m) => limpaEx(m));
    setExDfd((m) => limpaEx(m));
  }

  async function salvar() {
    setSalvando(true);
    try {
      const body: RegrasAvaliacao = { pontos, exProtocolo, exDfd, editaveis, sinonimos, importancias, estadosCiclo };
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
      setImportancias(IMPORTANCIAS_PADRAO.map((i) => ({ ...i })));
      setEstadosCiclo({ ...ESTADOS_CICLO_PADRAO });
      toast.success("Regras restauradas ao padrão.");
    } catch {
      toast.error("Erro ao restaurar.");
    } finally {
      setSalvando(false);
    }
  }

  // Chip colorido de uma importância (nome + swatch da cor definida pelo ADM).
  function chipImportancia(id: string): ReactNode {
    const imp = impById(id);
    return (
      <span className="inline-flex items-center gap-1.5 rounded-chip border border-border px-2 py-0.5 text-[12px] font-medium text-text-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: imp.cor }} />
        {imp.nome}
      </span>
    );
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

  // Card de um ponto (importância + edição + ajuste automático). Sem hooks (não é componente).
  function cardPonto(ponto: PontoAvaliacao, ctx: Ctx): ReactNode {
    const global = pontos[ponto.chave] ?? importanciaPadraoDe(ponto.chave);
    const opcoes = opcoesDoPonto(ponto);
    const soLeitura = opcoes.length <= 1;
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
              {chipImportancia(efetivo)}
            </div>
            <p className="mt-0.5 text-[12px] text-muted">{ponto.descricao}</p>
          </div>
          {soLeitura ? (
            <span className="text-[12px] font-medium text-muted">Sempre {impById(global).nome.toLowerCase()}</span>
          ) : (
            <select
              aria-label={`Importância de ${ponto.rotulo}`}
              className={`${selectCls} min-w-[9rem]`}
              value={valor}
              onChange={(e) => {
                const v = e.target.value as Nivel | "";
                if (ctx.eixo === "global") setGlobal(ponto.chave, v as Nivel);
                else setEx(ctx.eixo, ctx.ctxKey, ponto.chave, v);
              }}
            >
              {!ehGlobal && <option value="">Padrão ({impById(global).nome})</option>}
              {opcoes.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nome}
                </option>
              ))}
            </select>
          )}
        </div>
        {/* Edição/ajuste automático são GLOBAIS (só no contexto "Todos"). */}
        {ehGlobal && ponto.suportaEdicao && (
          <div className="mt-1">
            <Switch
              label="Editável pelo usuário na análise"
              checked={editavelAtual}
              onChange={(v) => setEditavel(ponto.chave, v)}
            />
          </div>
        )}
        {ehGlobal && ponto.suportaAuto && impById(efetivo).comportamento === "automatico" && editorSinonimos(ponto.chave)}
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
              Exceção de importância — o que não for definido aqui herda o padrão (todos). Edição e ajuste
              automático são definidos no &quot;Padrão (todos)&quot;.
            </p>
          )}
        </div>
        <div className="space-y-2">{lista.map((p) => cardPonto(p, ctx))}</div>
      </div>
    );
  }

  // Painel "Importâncias" (CRUD) + estados de ciclo.
  function painelImportancias(): ReactNode {
    return (
      <div className="space-y-4">
        <p className="text-[12px] text-muted">
          As importâncias definem o rigor de cada ponto: o nome, a <strong>cor</strong> e o comportamento —{" "}
          <strong>bloqueia</strong> (trava) ou <strong>avisa</strong>/<strong>automático</strong>/<strong>ignora</strong>{" "}
          (não bloqueiam). As quatro base não podem ser excluídas nem ter o comportamento alterado, mas o nome e a cor
          são livres.
        </p>
        <div className="space-y-2">
          {importancias.map((imp, i) => (
            <div key={imp.id} className="flex flex-wrap items-center gap-3 rounded-control border border-border bg-surface px-3 py-2.5">
              <span className="h-5 w-5 shrink-0 rounded-full border border-border" style={{ backgroundColor: imp.cor }} />
              <div className="min-w-[9rem] flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13.5px] font-semibold text-text">{imp.nome}</span>
                  {imp.builtin && <span className="text-[11px] text-muted">base</span>}
                </div>
                <p className="mt-0.5 text-[12px] text-muted">{DESC_COMPORTAMENTO[imp.comportamento]}</p>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" aria-label="Subir" disabled={i === 0} onClick={() => moverImp(i, -1)} icon={<IconArrowUp className="h-4 w-4" />} />
                <Button variant="ghost" aria-label="Descer" disabled={i === importancias.length - 1} onClick={() => moverImp(i, 1)} icon={<IconArrowDown className="h-4 w-4" />} />
                <Button variant="ghost" aria-label="Editar" onClick={() => setEditImp({ ...imp })} icon={<IconPencil className="h-4 w-4" />} />
                {!imp.builtin && (
                  <Button variant="ghost" aria-label="Excluir" onClick={() => excluirImp(imp)} icon={<IconTrash className="h-4 w-4" />} style={{ color: "var(--danger)" }} />
                )}
              </div>
            </div>
          ))}
        </div>
        <Button variant="secondary" icon={<IconPlus className="h-4 w-4" />} onClick={novaImp}>
          Nova importância
        </Button>

        <div className="rounded-control border border-border bg-surface-2 p-3">
          <p className="mb-2 text-[12px] font-semibold text-muted">
            Estados de ciclo — rótulo e cor. O ciclo é fixo (Editado/Regularizado/Regular/Pendente); a severidade
            (erro/atenção) segue a cor da importância.
          </p>
          <div className="space-y-2">
            {ESTADOS_CICLO_ORDEM.map((id) => {
              const cfg = estadosCiclo[id];
              return (
                <div key={id} className="flex flex-wrap items-center gap-3">
                  <span className="h-5 w-5 shrink-0 rounded-full border border-border" style={{ backgroundColor: cfg.cor }} />
                  <div className="w-48">
                    <TextField aria-label={`Nome do estado ${id}`} value={cfg.nome} onChange={(e) => setCiclo(id, { nome: e.target.value })} />
                  </div>
                  <ColorField label="Cor" value={cfg.cor} onChange={(cor) => setCiclo(id, { cor })} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text">Avaliação</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Controle total de importação de DFD, correção de itens e protocolação. Crie e edite as{" "}
            <strong>importâncias</strong> (nome, cor e se bloqueiam), atribua uma a cada dado, escolha se o usuário pode
            editá-lo na análise e as palavras-chave do ajuste automático. Com exceções por tipo de DFD e por categoria
            de protocolo.
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
            { key: "importancias", label: "Importâncias", content: painelImportancias() },
            { key: "protocolo", label: "Protocolo", content: painelSujeito("protocolo", "protocolo", ctxProto, setCtxProto) },
            { key: "dfd", label: "DFD", content: painelSujeito("dfd", "dfd", ctxDfd, setCtxDfd) },
            { key: "item", label: "Item", content: painelSujeito("item", "dfd", ctxItem, setCtxItem) },
          ]}
        />
      </div>

      {editImp && (
        <Modal
          open
          onClose={() => setEditImp(null)}
          titulo={editImp.builtin ? `Editar ${editImp.nome}` : importancias.some((x) => x.id === editImp.id) ? "Editar importância" : "Nova importância"}
          size="sm"
          rodape={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditImp(null)}>
                Cancelar
              </Button>
              <Button onClick={salvarImp}>OK</Button>
            </div>
          }
        >
          <div className="space-y-4">
            <TextField label="Nome" value={editImp.nome} onChange={(e) => setEditImp({ ...editImp, nome: e.target.value })} placeholder="Ex.: Crítico" />
            <ColorField label="Cor" value={editImp.cor} onChange={(cor) => setEditImp({ ...editImp, cor })} />
            <div>
              <span className={labelCls}>Comportamento</span>
              <div className="mt-1">
                <Switch
                  label="Bloqueia importação/protocolação"
                  checked={editImp.comportamento === "bloqueia"}
                  disabled={editImp.builtin}
                  onChange={(on) => setEditImp({ ...editImp, comportamento: on ? "bloqueia" : "avisa" })}
                />
              </div>
              {editImp.comportamento !== "bloqueia" && (
                <div className="mt-2">
                  <Segmented
                    value={editImp.comportamento as "avisa" | "automatico" | "ignora"}
                    disabled={editImp.builtin}
                    options={[
                      { value: "avisa", label: "Avisa" },
                      { value: "automatico", label: "Automático" },
                      { value: "ignora", label: "Ignora" },
                    ]}
                    onChange={(v) => setEditImp({ ...editImp, comportamento: v })}
                  />
                </div>
              )}
              <p className="mt-2 text-[12px] text-muted">
                {editImp.builtin
                  ? "Importância base: o comportamento é fixo; só o nome e a cor mudam."
                  : DESC_COMPORTAMENTO[editImp.comportamento]}
              </p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
