"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { chavePadrao, chavePadraoAdm, type EdicaoTabela, edicaoInicial, edicoesDaChave, idPadrao, idPadraoAdm } from "@/lib/edicoes-tabela-core";
import { AvisoFlutuante } from "./AvisoFlutuante";
import { Button } from "./Button";
import { useConfirmacao } from "./Confirmacao";
import { Dropdown } from "./Dropdown";
import { Checkbox, TextField } from "./Field";
import { IconDesafixar, IconEye, IconFilter, IconFixar, IconLimpar, IconPencil, IconRestaurar, IconSave, IconSettings, IconTrash, IconUndo, IconUsers, IconVisao } from "./icons";
import { Modal } from "./Modal";
import { Segmented } from "./Segmented";

async function chamar(url: string, method: string, body?: unknown): Promise<{ id?: number }> {
  const r = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => null);
  const j = (await r?.json().catch(() => null)) as { ok?: boolean; error?: string; id?: number } | null;
  if (!r?.ok || !j?.ok) throw new Error(j?.error ?? "Não foi possível concluir. Tente de novo.");
  return j;
}

/**
 * EDIÇÕES SALVAS de uma tabela (`chave`): as do usuário e as PÚBLICAS, a ESCOLHIDA agora (abre na PADRÃO dele — senão no
 * padrão do sistema) e as ações — escolher, definir como padrão, salvar (nova ou atualizar a própria; só para mim ou
 * pública) e excluir a própria. Chama `POST/PATCH/DELETE /api/tabela/edicoes` e guarda a padrão em
 * `/api/preferencias/tabela` (`padrao:<chave>`). Erros LANÇAM (a tela mostra no aviso flutuante).
 */
export function useEdicoesTabela(
  chave: string,
  edicoes: EdicaoTabela[],
  padroes: Record<string, unknown>,
  /** Avisa quem guarda a lista FORA da tabela (ex.: a Mesa, cujas tabelas remontam ao trocar de visão). */
  onMudar?: (lista: EdicaoTabela[], padroes: Record<string, unknown>) => void,
) {
  const [lista, setLista] = useState(edicoes);
  const [prefs, setPrefs] = useState(padroes);
  const inicio = useRef({ lista, prefs });
  // biome-ignore lint/correctness/useExhaustiveDependencies: avisa só quando a lista ou as preferências MUDAM.
  useEffect(() => {
    if (inicio.current.lista !== lista || inicio.current.prefs !== prefs) onMudar?.(lista, prefs);
  }, [lista, prefs]);
  const [escolhas, setEscolhas] = useState<Record<string, number | null>>({});
  const [gravando, setGravando] = useState(false);
  const { minhas, publicas } = useMemo(() => edicoesDaChave(lista, chave), [lista, chave]);
  const escolhida = chave in escolhas ? escolhas[chave] : (edicaoInicial(lista, prefs, chave)?.id ?? null);
  const atual = [...minhas, ...publicas].find((e) => e.id === escolhida) ?? null;
  const padraoId = idPadrao(prefs, chave);
  const padraoAdmId = idPadraoAdm(prefs, chave);
  const inicialId = edicaoInicial(lista, prefs, chave)?.id ?? null;

  const gravar = async <T,>(f: () => Promise<T>): Promise<T> => {
    setGravando(true);
    try {
      return await f();
    } finally {
      setGravando(false);
    }
  };
  const escolher = (id: number | null) => setEscolhas((e) => ({ ...e, [chave]: id }));
  const definirPadrao = (id: number | null) =>
    gravar(async () => {
      const k = chavePadrao(chave);
      await chamar("/api/preferencias/tabela", id == null ? "DELETE" : "PUT", id == null ? { chave: k } : { chave: k, valor: { id } });
      setPrefs((p) => {
        const { [k]: _, ...resto } = p;
        return id == null ? resto : { ...resto, [k]: { id } };
      });
    });
  /** Só o ADM: a padrão PARA TODOS da tabela (uma visão pública) ou nenhuma. */
  const definirPadraoTodos = (id: number | null) =>
    gravar(async () => {
      await chamar("/api/admin/tabela/padrao", "PUT", { chave, id });
      const k = chavePadraoAdm(chave);
      setPrefs((p) => {
        const { [k]: _, ...resto } = p;
        return id == null ? resto : { ...resto, [k]: { id } };
      });
    });
  const excluir = (e: EdicaoTabela) =>
    gravar(async () => {
      await chamar(`/api/tabela/edicoes/${e.id}`, "DELETE");
      setLista((l) => l.filter((x) => x.id !== e.id));
      if (e.id === escolhida) escolher(null);
    });
  const salvar = (d: { nome: string; publico: boolean; valor: Record<string, unknown>; atualizar: boolean; padrao: boolean }) =>
    gravar(async () => {
      let id: number;
      if (d.atualizar && atual?.minha) {
        id = atual.id;
        await chamar(`/api/tabela/edicoes/${id}`, "PATCH", { nome: d.nome, publico: d.publico, valor: d.valor });
        setLista((l) => l.map((x) => (x.id === id ? { ...x, nome: d.nome, publico: d.publico, valor: d.valor } : x)));
      } else {
        id = (await chamar("/api/tabela/edicoes", "POST", { chave, nome: d.nome, publico: d.publico, valor: d.valor })).id as number;
        setLista((l) => [...l, { id, chave, nome: d.nome, publico: d.publico, minha: true, autor: "Você", valor: d.valor }]);
      }
      escolher(id);
      if (d.padrao && padraoId !== id) {
        const k = chavePadrao(chave);
        await chamar("/api/preferencias/tabela", "PUT", { chave: k, valor: { id } });
        setPrefs((p) => ({ ...p, [k]: { id } }));
      }
      return id;
    });
  return { minhas, publicas, atual, padraoId, padraoAdmId, inicialId, gravando, escolher, definirPadrao, definirPadraoTodos, excluir, salvar };
}

/**
 * PAINEL DE VISÕES (no RODAPÉ da tabela) — o gatilho mostra a visão em uso e o número de filtros; o painel tem três partes:
 * **Filtros (N)** (o que está filtrado agora + Salvar como visão · Limpar), **Visões (N)** (as minhas e as públicas — o
 * ícone de pessoas marca a pública; tocar aplica; a lixeira exclui a minha ou, com `podeModerar`, a pública de outra
 * pessoa) e **Estado inicial** (com que visão a tabela ABRE: o alfinete fixa a em uso como a MINHA padrão; o ADM fixa
 * também a padrão PARA TODOS — só visão pública; restaurar volta a ele). A escolha da pessoa vence a do ADM. O lápis ao
 * lado liga a edição da planilha. Na altura dos controles; 44px no toque; folha no celular.
 */
export function PainelVisoes({
  minhas,
  publicas,
  atual,
  padraoId,
  padraoAdmId,
  inicialId,
  filtros,
  onEscolher,
  onPadrao,
  onPadraoTodos,
  onExcluir,
  onEditar,
  onSalvar,
  onLimparFiltros,
  onRestaurar,
  disabled = false,
  gravando = false,
  podeModerar = false,
}: {
  minhas: EdicaoTabela[];
  publicas: EdicaoTabela[];
  atual: EdicaoTabela | null;
  padraoId: number | null;
  /** A padrão PARA TODOS do ADM (`null` = nenhuma). */
  padraoAdmId: number | null;
  /** A visão com que a tabela ABRE (`edicaoInicial`; `null` = o padrão do sistema). */
  inicialId: number | null;
  /** Os filtros ativos agora (rótulos curtos); ausente = a tabela não filtra (ex.: a tabela cruzada). */
  filtros?: readonly string[];
  onEscolher: (id: number | null) => void;
  onPadrao: (id: number | null) => void;
  /** Só o ADM: define (ou tira) a padrão para todos. */
  onPadraoTodos?: (id: number | null) => void;
  onExcluir: (e: EdicaoTabela) => void;
  onEditar: () => void;
  onSalvar: () => void;
  onLimparFiltros?: () => void;
  onRestaurar: () => void;
  /** Trava só o lápis (a tabela sem linhas não se edita). */
  disabled?: boolean;
  /** Gravando uma visão: o painel não abre. */
  gravando?: boolean;
  podeModerar?: boolean;
}) {
  const todas = [...minhas, ...publicas];
  const nFiltros = filtros?.length ?? 0;
  const ehMinhaPadrao = padraoId != null && (atual?.id ?? null) === padraoId;
  const ehPadraoTodos = padraoAdmId != null && (atual?.id ?? null) === padraoAdmId;
  const inicial = todas.find((e) => e.id === inicialId) ?? null;
  const origemInicial = inicial == null ? "sistema" : inicial.id === padraoId ? "seu" : "para todos";
  const podeExcluir = (e: EdicaoTabela) => e.minha || (podeModerar && e.publico);
  const quadrado = (ativo: boolean) => `${ativo ? "text-accent" : ""}`;
  return (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="icon" icon={<IconPencil className="h-4 w-4" />} aria-label="Editar a planilha" title="Editar a planilha" onClick={onEditar} disabled={disabled || gravando} />
      <Dropdown
        papel="dialog"
        ariaLabel="Visões da tabela"
        title={`Visão em uso: ${atual?.nome ?? "Padrão do sistema"}${nFiltros ? ` · ${nFiltros} filtro(s)` : ""}`}
        width={340}
        folha
        bloqueado={gravando}
        triggerClassName="inline-flex h-[44px] max-w-[14rem] items-center gap-1.5 rounded-control border border-border bg-surface px-2.5 text-[13px] text-text hover:bg-surface-2 lg:h-[var(--h-control-sm)]"
        trigger={
          <>
            <IconVisao className={`h-4 w-4 shrink-0 ${atual ? "text-accent" : "text-muted"}`} aria-hidden="true" />
            <span className="hidden truncate sm:inline">{atual?.nome ?? "Padrão do sistema"}</span>
            {nFiltros > 0 && <span className="rounded-chip bg-accent-soft px-1.5 text-[11.5px] font-bold text-accent tabular-nums">{nFiltros}</span>}
          </>
        }
      >
        {(fechar) => (
          <div className="divide-y divide-border">
            <section className="space-y-2 p-[var(--pad-card)]">
              <div className="flex items-center gap-2">
                <IconFilter className="h-4 w-4 text-muted" aria-hidden="true" />
                <p className="text-[14px] font-bold text-text">Filtros</p>
                <span className="rounded-chip bg-surface-2 px-2 text-[12px] font-bold text-muted tabular-nums">{nFiltros}</span>
                <div className="ml-auto flex gap-1">
                  <Button
                    size="sm"
                    variant="icon"
                    icon={<IconSave className="h-4 w-4" />}
                    aria-label="Salvar como visão"
                    title="Salvar colunas, filtros e ordem como uma visão"
                    onClick={() => {
                      fechar();
                      onSalvar();
                    }}
                  />
                  {onLimparFiltros && (
                    <Button size="sm" variant="icon" icon={<IconLimpar className="h-4 w-4" />} aria-label="Limpar filtros" title="Limpar filtros" onClick={onLimparFiltros} disabled={!nFiltros} />
                  )}
                </div>
              </div>
              <div className="rounded-control bg-surface-2 px-3 py-2 text-[13px] text-muted">
                {nFiltros ? (
                  <ul className="space-y-0.5">
                    {filtros?.map((f) => (
                      <li key={f} className="truncate text-text" title={f}>
                        {f}
                      </li>
                    ))}
                  </ul>
                ) : (
                  "Nenhum filtro."
                )}
              </div>
            </section>
            <section className="space-y-1 p-[var(--pad-card)]">
              <div className="flex items-center gap-2 pb-1">
                <IconVisao className="h-4 w-4 text-muted" aria-hidden="true" />
                <p className="text-[14px] font-bold text-text">Visões</p>
                <span className="rounded-chip bg-surface-2 px-2 text-[12px] font-bold text-muted tabular-nums">{todas.length}</span>
              </div>
              <ul className="max-h-[40vh] overflow-y-auto">
                <LinhaVisao nome="Padrão do sistema" ativa={atual == null} onEscolher={() => { fechar(); onEscolher(null); }} />
                {todas.map((e) => (
                  <LinhaVisao
                    key={e.id}
                    nome={e.nome}
                    ativa={atual?.id === e.id}
                    publica={e.publico}
                    autor={e.minha ? undefined : e.autor}
                    paraTodos={e.id === padraoAdmId}
                    onEscolher={() => {
                      fechar();
                      onEscolher(e.id);
                    }}
                    onExcluir={podeExcluir(e) ? () => onExcluir(e) : undefined}
                  />
                ))}
              </ul>
            </section>
            <section className="space-y-2 p-[var(--pad-card)]">
              <div className="flex items-center gap-2">
                <IconSettings className="h-4 w-4 text-muted" aria-hidden="true" />
                <p className="min-w-0 text-[14px] font-bold text-text">Estado inicial</p>
                <span className="truncate rounded-chip bg-surface-2 px-2 text-[12px] text-muted" title={`A tabela abre em: ${inicial?.nome ?? "Padrão do sistema"}`}>
                  {origemInicial === "sistema" ? "sistema" : `${origemInicial}: ${inicial?.nome}`}
                </span>
                <div className="ml-auto flex shrink-0 gap-1">
                  <Button
                    size="sm"
                    variant="icon"
                    aria-pressed={ehMinhaPadrao}
                    icon={<IconFixar className={`h-4 w-4 ${quadrado(ehMinhaPadrao)}`} />}
                    aria-label={ehMinhaPadrao ? "Deixar de abrir nesta visão" : "Abrir sempre nesta visão (só para mim)"}
                    title={ehMinhaPadrao ? "Sua padrão — toque para deixar de abrir nela" : `Abrir sempre em “${atual?.nome ?? "Padrão do sistema"}” (só para mim)`}
                    onClick={() => onPadrao(ehMinhaPadrao ? null : (atual?.id ?? null))}
                  />
                  {onPadraoTodos && (
                    <Button
                      size="sm"
                      variant="icon"
                      aria-pressed={ehPadraoTodos}
                      icon={<IconUsers className={`h-4 w-4 ${quadrado(ehPadraoTodos)}`} />}
                      aria-label={ehPadraoTodos ? "Tirar o padrão para todos" : "Padrão para todos"}
                      title={
                        ehPadraoTodos
                          ? "Padrão para todos — toque para tirar"
                          : atual?.publico
                            ? `Todos abrem em “${atual.nome}” (quem escolheu a própria padrão abre na dela)`
                            : "Só uma visão pública pode ser o padrão para todos"
                      }
                      disabled={!ehPadraoTodos && !atual?.publico}
                      onClick={() => onPadraoTodos(ehPadraoTodos ? null : (atual?.id ?? null))}
                    />
                  )}
                  <Button
                    size="sm"
                    variant="icon"
                    icon={<IconRestaurar className="h-4 w-4" />}
                    aria-label="Restaurar o estado inicial"
                    title="Voltar ao estado inicial (colunas, filtros e ordem)"
                    onClick={() => {
                      fechar();
                      onRestaurar();
                    }}
                  />
                </div>
              </div>
            </section>
          </div>
        )}
      </Dropdown>
    </div>
  );
}

/** Uma linha da lista de visões: tocar aplica; pública (ícone de pessoas), padrão para todos e excluir. */
function LinhaVisao({
  nome,
  ativa,
  publica = false,
  autor,
  paraTodos = false,
  onEscolher,
  onExcluir,
}: {
  nome: string;
  ativa: boolean;
  publica?: boolean;
  autor?: string;
  paraTodos?: boolean;
  onEscolher: () => void;
  onExcluir?: () => void;
}) {
  return (
    <li className="flex items-center gap-1">
      <button
        type="button"
        onClick={onEscolher}
        aria-current={ativa || undefined}
        className={`flex min-h-[44px] min-w-0 flex-1 items-center gap-2 rounded-control px-2 text-left text-[13.5px] lg:min-h-[36px] ${ativa ? "bg-accent-soft font-bold text-accent" : "text-text hover:bg-surface-2"}`}
      >
        <IconVisao className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate" title={autor ? `${nome} · de ${autor}` : nome}>
          {nome}
          {autor && <span className="font-normal text-muted"> · {autor}</span>}
        </span>
        {paraTodos && <IconFixar className="h-3.5 w-3.5 shrink-0 text-accent" aria-label="Padrão para todos" />}
        {publica && <IconUsers className="h-4 w-4 shrink-0 text-muted" aria-label="Pública" />}
      </button>
      {onExcluir && (
        <Button size="sm" variant="icon" aria-label={`Excluir a visão ${nome}`} title="Excluir esta visão" icon={<IconTrash className="h-4 w-4" style={{ color: "var(--danger)" }} />} onClick={onExcluir} />
      )}
    </li>
  );
}

type Destino = "atualizar" | "nova";

/**
 * SALVAR a edição da tabela: nome, **só para mim** ou **pública** (todos veem e usam — só com `podePublicar`, o Configurar
 * da tela; sem ele, a edição é sempre só da pessoa e a sua pública, ao ser atualizada, deixa de ser pública) e "usar como
 * minha padrão"; editando uma edição MINHA, escolhe entre ATUALIZÁ-LA e salvar como NOVA (a de outra pessoa sempre vira
 * uma nova, minha).
 */
export function SalvarEdicao({
  aberto,
  atual,
  ehPadrao,
  gravando,
  podePublicar,
  onFechar,
  onSalvar,
}: {
  aberto: boolean;
  atual: EdicaoTabela | null;
  ehPadrao: boolean;
  gravando: boolean;
  /** O papel CONFIGURA a tela da tabela: pode publicar para todos. */
  podePublicar: boolean;
  onFechar: () => void;
  onSalvar: (d: { nome: string; publico: boolean; atualizar: boolean; padrao: boolean }) => void;
}) {
  const podeAtualizar = atual?.minha === true;
  const [destino, setDestino] = useState<Destino>(podeAtualizar ? "atualizar" : "nova");
  const [nome, setNome] = useState(podeAtualizar ? (atual?.nome ?? "") : "");
  const [publico, setPublico] = useState(podePublicar && podeAtualizar ? (atual?.publico ?? false) : false);
  // Sem Configurar, a SUA pública, atualizada, deixa de ser pública (publicar exige Configurar).
  const despublica = !podePublicar && podeAtualizar && destino === "atualizar" && atual?.publico === true;
  const [padrao, setPadrao] = useState(ehPadrao);
  const valido = nome.trim().length > 0 && nome.trim().length <= 60;
  return (
    <Modal
      open={aberto}
      onClose={onFechar}
      bloqueado={gravando}
      titulo="Salvar visão"
      size="md"
      rodape={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onFechar} disabled={gravando}>
            Cancelar
          </Button>
          <Button
            onClick={() => onSalvar({ nome: nome.trim(), publico, atualizar: podeAtualizar && destino === "atualizar", padrao })}
            loading={gravando}
            disabled={!valido}
          >
            Salvar
          </Button>
        </div>
      }
    >
      <div className="space-y-[var(--gap-block)]">
        {podeAtualizar && (
          <Segmented<Destino>
            ariaLabel="Onde salvar"
            value={destino}
            onChange={(v) => {
              setDestino(v);
              if (v === "nova") setNome("");
              else {
                setNome(atual?.nome ?? "");
                setPublico(podePublicar && (atual?.publico ?? false));
              }
            }}
            options={[
              { value: "atualizar", label: `Atualizar “${atual?.nome ?? ""}”`, curto: "Atualizar" },
              { value: "nova", label: "Salvar como nova", curto: "Nova" },
            ]}
          />
        )}
        <TextField label="Nome da visão" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Pessoal por elemento" maxLength={60} />
        <div className="space-y-2">
          <p className="text-[13.5px] font-bold text-text">Quem vê</p>
          {podePublicar ? (
            <Segmented<"eu" | "todos">
              ariaLabel="Quem vê a visão"
              value={publico ? "todos" : "eu"}
              onChange={(v) => setPublico(v === "todos")}
              options={[
                { value: "eu", label: "Só para mim" },
                { value: "todos", label: "Pública (todos)" },
              ]}
            />
          ) : (
            <p className="text-[13px] text-muted">
              Só para você.{" "}
              {despublica
                ? "Esta visão é pública: ao atualizar, ela passa a ser só sua (publicar exige Configurar nesta tela)."
                : "Publicar para todos exige Configurar nesta tela."}
            </p>
          )}
        </div>
        <Checkbox checked={padrao} onChange={(e) => setPadrao(e.target.checked)} label="Abrir sempre nesta visão (só para mim)" />
      </div>
    </Modal>
  );
}

/**
 * EDITOR de uma tabela com EDIÇÕES SALVAS — o fluxo COMPLETO, o MESMO no Comparativo do orçamento e nas tabelas da Mesa:
 * o layout SALVO (a edição em uso — a padrão do usuário ao abrir), o RASCUNHO enquanto edita (`editar`/`mudar`), e o que
 * vai no RODAPÉ da tabela — fora da edição, o `PainelVisoes` (lápis · filtros · visões · estado inicial); editando, a
 * `BarraEdicao` (ações de colunas + extras + Padrão · Cancelar · Salvar) — mais as camadas (`SalvarEdicao`, a
 * confirmação e o aviso flutuante). `paraSalvar` completa o rascunho com o que a tabela guarda fora dele (ex.: a ordenação
 * e os filtros da `DataTable`); `aoEscolher` aplica esse estado quando o usuário troca de edição.
 */
export function useEditorEdicoes<L>({
  chave,
  edicoes,
  padroes,
  coerce,
  igual,
  padrao,
  paraSalvar = (l) => l,
  aoEscolher,
  onMudar,
  podePublicar,
  admin = false,
}: {
  chave: string;
  edicoes: EdicaoTabela[];
  padroes: Record<string, unknown>;
  /** O papel CONFIGURA a tela da tabela: publica edições e modera as públicas de outras pessoas. */
  podePublicar: boolean;
  /** O ADM: define a visão padrão PARA TODOS. */
  admin?: boolean;
  onMudar?: (lista: EdicaoTabela[], padroes: Record<string, unknown>) => void;
  coerce: (v: unknown) => L;
  igual: (a: L, b: L) => boolean;
  /** O padrão do sistema ("Voltar ao padrão"). */
  padrao: L;
  paraSalvar?: (l: L) => L;
  aoEscolher?: (l: L) => void;
}) {
  const ed = useEdicoesTabela(chave, edicoes, padroes, onMudar);
  const salvo = useMemo(() => coerce(ed.atual?.valor), [ed.atual, coerce]);
  const [rascunho, setRascunho] = useState<L | null>(null);
  // O AJUSTE da sessão (o seletor de colunas — sem entrar na edição): vale até trocar de visão; salvo, vira a visão.
  const [ajuste, setAjuste] = useState<L | null>(null);
  // Outra tabela no MESMO componente (a Mesa troca de visão sem remontar): a edição em curso não passa para ela.
  const [chaveEd, setChaveEd] = useState(chave);
  if (chaveEd !== chave) {
    setChaveEd(chave);
    setRascunho(null);
    setAjuste(null);
  }
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ kind: "ok" | "danger"; texto: string } | null>(null);
  const { confirmar, confirmacao } = useConfirmacao();
  const editando = rascunho != null;
  const layout = rascunho ?? ajuste ?? salvo;
  const mudar = (f: (l: L) => L) => setRascunho((r) => (r ? f(r) : r));
  /** Ajusta o layout SEM entrar na edição (ex.: o seletor de colunas); editando, muda o rascunho. */
  const ajustar = (f: (l: L) => L) => (editando ? mudar(f) : setAjuste((a) => f(a ?? salvo)));

  // As ações das edições salvas: o erro vira aviso flutuante (nada de alerta do navegador).
  const tentar = async (f: () => Promise<unknown>, ok?: string) => {
    try {
      await f();
      if (ok) setAviso({ kind: "ok", texto: ok });
    } catch (e) {
      setAviso({ kind: "danger", texto: e instanceof Error ? e.message : "Não foi possível concluir." });
    }
  };
  const cancelar = async () => {
    if (rascunho && !igual(paraSalvar(rascunho), paraSalvar(salvo)) && !(await confirmar({ titulo: "Descartar as edições da tabela?", confirmar: "Descartar", perigo: true })))
      return;
    setRascunho(null);
  };
  const salvar = (d: { nome: string; publico: boolean; atualizar: boolean; padrao: boolean }) =>
    tentar(async () => {
      await ed.salvar({ ...d, valor: paraSalvar(layout) as Record<string, unknown> });
      setSalvando(false);
      setRascunho(null);
      setAjuste(null);
    }, "Visão salva.");
  const escolher = (id: number | null) => {
    ed.escolher(id);
    setAjuste(null);
    aoEscolher?.(coerce([...ed.minhas, ...ed.publicas].find((e) => e.id === id)?.valor));
  };
  const excluir = async (e: EdicaoTabela) => {
    const texto = !e.minha ? `Ela é pública, de ${e.autor}: some para todos.` : e.publico ? "Ela é pública: some para todos." : undefined;
    if (!(await confirmar({ titulo: `Excluir a visão "${e.nome}"?`, texto, confirmar: "Excluir", perigo: true }))) return;
    const emUso = e.id === ed.atual?.id;
    await tentar(async () => {
      await ed.excluir(e);
      if (emUso) {
        setAjuste(null);
        aoEscolher?.(coerce(undefined));
      }
    }, "Visão excluída.");
  };

  /** O RODAPÉ: o painel das visões (fora da edição) ou a barra da edição (editando). */
  const rodape = (o: {
    onEditar: () => void;
    disabled?: boolean;
    /** Os filtros ativos agora (rótulos curtos) e como limpá-los — ausente na tabela que não filtra. */
    filtros?: readonly string[];
    onLimparFiltros?: () => void;
    /** Controles próprios da tabela na barra de edição (ex.: mapa de calor). */
    extras?: ReactNode;
    onCongelarTodas: () => void;
    onDescongelarTodas: () => void;
    onMostrarTodas: () => void;
    semOcultas: boolean;
  }) =>
    editando ? (
      <BarraEdicao
        extras={o.extras}
        onCongelarTodas={o.onCongelarTodas}
        onDescongelarTodas={o.onDescongelarTodas}
        onMostrarTodas={o.onMostrarTodas}
        semOcultas={o.semOcultas}
        onPadrao={() => setRascunho(padrao)}
        onCancelar={cancelar}
        onSalvar={() => setSalvando(true)}
      />
    ) : (
      <PainelVisoes
        minhas={ed.minhas}
        publicas={ed.publicas}
        atual={ed.atual}
        padraoId={ed.padraoId}
        padraoAdmId={ed.padraoAdmId}
        inicialId={ed.inicialId}
        filtros={o.filtros}
        disabled={o.disabled}
        gravando={ed.gravando}
        podeModerar={podePublicar}
        onEditar={o.onEditar}
        onEscolher={escolher}
        onSalvar={() => setSalvando(true)}
        onLimparFiltros={o.onLimparFiltros}
        onRestaurar={() => escolher(ed.inicialId)}
        onPadrao={(id) => {
          const nome = [...ed.minhas, ...ed.publicas].find((e) => e.id === id)?.nome;
          void tentar(() => ed.definirPadrao(id), id == null ? "A tabela abre no padrão para todos ou no do sistema." : `A tabela abre em “${nome}” para você.`);
        }}
        onPadraoTodos={
          admin
            ? (id) => void tentar(() => ed.definirPadraoTodos(id), id == null ? "Padrão para todos retirado." : "Agora todos abrem nesta visão (quem escolheu a própria padrão abre na dela).")
            : undefined
        }
        onExcluir={(e) => void excluir(e)}
      />
    );

  const camadas = (
    <>
      {salvando && (
        <SalvarEdicao
          aberto
          atual={ed.atual}
          ehPadrao={(ed.atual?.id ?? null) === ed.padraoId && ed.atual != null}
          gravando={ed.gravando}
          podePublicar={podePublicar}
          onFechar={() => setSalvando(false)}
          onSalvar={salvar}
        />
      )}
      {confirmacao}
      {aviso && (
        <AvisoFlutuante kind={aviso.kind} titulo={aviso.kind === "ok" ? "Pronto" : "Atenção"} onClose={() => setAviso(null)} duracao={aviso.kind === "ok" ? 3000 : undefined}>
          {aviso.texto}
        </AvisoFlutuante>
      )}
    </>
  );

  return { salvo, layout, editando, editar: (base: L) => setRascunho(base), mudar, ajustar, rodape, camadas };
}

/** A BARRA da EDIÇÃO no rodapé da tabela: extras da tabela · congelar/descongelar/mostrar todas · Padrão · Cancelar · Salvar. */
function BarraEdicao({
  extras,
  onCongelarTodas,
  onDescongelarTodas,
  onMostrarTodas,
  semOcultas,
  onPadrao,
  onCancelar,
  onSalvar,
}: {
  extras?: ReactNode;
  onCongelarTodas: () => void;
  onDescongelarTodas: () => void;
  onMostrarTodas: () => void;
  semOcultas: boolean;
  onPadrao: () => void;
  onCancelar: () => void;
  onSalvar: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {extras}
      <div className="flex items-center gap-1">
        <Button size="sm" variant="icon" title="Congelar todas" aria-label="Congelar todas as colunas" icon={<IconFixar className="h-4 w-4" />} onClick={onCongelarTodas} />
        <Button size="sm" variant="icon" title="Descongelar todas" aria-label="Descongelar todas as colunas" icon={<IconDesafixar className="h-4 w-4" />} onClick={onDescongelarTodas} />
        <Button
          size="sm"
          variant="icon"
          title="Mostrar todas"
          aria-label="Mostrar todas as colunas"
          icon={<IconEye className="h-4 w-4" />}
          onClick={onMostrarTodas}
          disabled={semOcultas}
        />
        <Button size="sm" variant="icon" title="Voltar ao padrão do sistema" aria-label="Voltar ao padrão do sistema" icon={<IconUndo className="h-4 w-4" />} onClick={onPadrao} />
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button size="sm" icon={<IconSave className="h-4 w-4" />} onClick={onSalvar}>
          Salvar
        </Button>
      </div>
    </div>
  );
}
