"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { chavePadrao, type EdicaoTabela, edicaoInicial, edicoesDaChave, idPadrao } from "@/lib/edicoes-tabela-core";
import { AvisoFlutuante } from "./AvisoFlutuante";
import { Button } from "./Button";
import { useConfirmacao } from "./Confirmacao";
import { Checkbox, SelectField, TextField } from "./Field";
import { IconDesafixar, IconEstrela, IconEye, IconFixar, IconPencil, IconSave, IconTrash, IconUndo } from "./icons";
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
  const excluir = (e: EdicaoTabela) =>
    gravar(async () => {
      await chamar(`/api/tabela/edicoes/${e.id}`, "DELETE");
      setLista((l) => l.filter((x) => x.id !== e.id));
      escolher(null);
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
  return { minhas, publicas, atual, padraoId, gravando, escolher, definirPadrao, excluir, salvar };
}

/**
 * SELETOR das edições salvas (no RODAPÉ da tabela): o LÁPIS (só o ícone) liga a edição; o seletor troca a edição em uso
 * ("Padrão do sistema", as minhas e as públicas com o autor); a ESTRELA marca a em uso como a minha PADRÃO (a tabela abre
 * nela); a lixeira exclui a minha. Na altura dos controles; 44px no toque.
 */
export function SeletorEdicoes({
  minhas,
  publicas,
  atual,
  padraoId,
  onEscolher,
  onPadrao,
  onExcluir,
  onEditar,
  disabled = false,
}: {
  minhas: EdicaoTabela[];
  publicas: EdicaoTabela[];
  atual: EdicaoTabela | null;
  padraoId: number | null;
  onEscolher: (id: number | null) => void;
  onPadrao: () => void;
  onExcluir: () => void;
  onEditar: () => void;
  disabled?: boolean;
}) {
  const ehPadrao = (atual?.id ?? null) === padraoId;
  return (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="icon" icon={<IconPencil className="h-4 w-4" />} aria-label="Editar a planilha" title="Editar a planilha" onClick={onEditar} disabled={disabled} />
      <div className="w-44 sm:w-56">
        <SelectField
          compacto
          label="Edição"
          value={atual?.id ?? ""}
          disabled={disabled}
          onChange={(e) => onEscolher(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">Padrão do sistema</option>
          {minhas.length > 0 && (
            <optgroup label="Minhas">
              {minhas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                  {e.publico ? " · pública" : ""}
                </option>
              ))}
            </optgroup>
          )}
          {publicas.length > 0 && (
            <optgroup label="Públicas">
              {publicas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome} · {e.autor}
                </option>
              ))}
            </optgroup>
          )}
        </SelectField>
      </div>
      <Button
        size="sm"
        variant="icon"
        aria-pressed={ehPadrao}
        aria-label={ehPadrao ? "Esta é a sua edição padrão" : "Usar como minha edição padrão"}
        title={ehPadrao ? "Sua edição padrão (a tabela abre nela)" : "Usar como minha edição padrão"}
        icon={<IconEstrela className={`h-4 w-4 ${ehPadrao ? "fill-current text-accent" : ""}`} />}
        onClick={onPadrao}
        disabled={disabled || ehPadrao}
      />
      {atual?.minha && (
        <Button
          size="sm"
          variant="icon"
          aria-label={`Excluir a edição ${atual.nome}`}
          title="Excluir esta edição"
          icon={<IconTrash className="h-4 w-4" style={{ color: "var(--danger)" }} />}
          onClick={onExcluir}
          disabled={disabled}
        />
      )}
    </div>
  );
}

type Destino = "atualizar" | "nova";

/**
 * SALVAR a edição da tabela: nome, **só para mim** ou **pública** (todos veem e usam) e "usar como minha padrão"; editando
 * uma edição MINHA, escolhe entre ATUALIZÁ-LA e salvar como NOVA (a de outra pessoa sempre vira uma nova, minha).
 */
export function SalvarEdicao({
  aberto,
  atual,
  ehPadrao,
  gravando,
  onFechar,
  onSalvar,
}: {
  aberto: boolean;
  atual: EdicaoTabela | null;
  ehPadrao: boolean;
  gravando: boolean;
  onFechar: () => void;
  onSalvar: (d: { nome: string; publico: boolean; atualizar: boolean; padrao: boolean }) => void;
}) {
  const podeAtualizar = atual?.minha === true;
  const [destino, setDestino] = useState<Destino>(podeAtualizar ? "atualizar" : "nova");
  const [nome, setNome] = useState(podeAtualizar ? (atual?.nome ?? "") : "");
  const [publico, setPublico] = useState(podeAtualizar ? (atual?.publico ?? false) : false);
  const [padrao, setPadrao] = useState(ehPadrao);
  const valido = nome.trim().length > 0 && nome.trim().length <= 60;
  return (
    <Modal
      open={aberto}
      onClose={onFechar}
      bloqueado={gravando}
      titulo="Salvar edição"
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
                setPublico(atual?.publico ?? false);
              }
            }}
            options={[
              { value: "atualizar", label: `Atualizar “${atual?.nome ?? ""}”`, curto: "Atualizar" },
              { value: "nova", label: "Salvar como nova", curto: "Nova" },
            ]}
          />
        )}
        <TextField label="Nome da edição" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Pessoal por elemento" maxLength={60} />
        <div className="space-y-2">
          <p className="text-[13.5px] font-bold text-text">Quem vê</p>
          <Segmented<"eu" | "todos">
            ariaLabel="Quem vê a edição"
            value={publico ? "todos" : "eu"}
            onChange={(v) => setPublico(v === "todos")}
            options={[
              { value: "eu", label: "Só para mim" },
              { value: "todos", label: "Pública (todos)" },
            ]}
          />
        </div>
        <Checkbox checked={padrao} onChange={(e) => setPadrao(e.target.checked)} label="Usar como minha edição padrão (a tabela abre nela)" />
      </div>
    </Modal>
  );
}

/**
 * EDITOR de uma tabela com EDIÇÕES SALVAS — o fluxo COMPLETO, o MESMO no Comparativo do orçamento e nas tabelas da Mesa:
 * o layout SALVO (a edição em uso — a padrão do usuário ao abrir), o RASCUNHO enquanto edita (`editar`/`mudar`), e o que
 * vai no RODAPÉ da tabela — fora da edição, o `SeletorEdicoes` (lápis · edição · estrela · lixeira); editando, a
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
}: {
  chave: string;
  edicoes: EdicaoTabela[];
  padroes: Record<string, unknown>;
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
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ kind: "ok" | "danger"; texto: string } | null>(null);
  const { confirmar, confirmacao } = useConfirmacao();
  const editando = rascunho != null;
  const layout = rascunho ?? salvo;
  const mudar = (f: (l: L) => L) => setRascunho((r) => (r ? f(r) : r));

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
      if (!rascunho) return;
      await ed.salvar({ ...d, valor: paraSalvar(rascunho) as Record<string, unknown> });
      setSalvando(false);
      setRascunho(null);
    }, "Edição salva.");
  const excluir = async () => {
    const e = ed.atual;
    if (!e || !(await confirmar({ titulo: `Excluir a edição "${e.nome}"?`, texto: e.publico ? "Ela é pública: some para todos." : undefined, confirmar: "Excluir", perigo: true })))
      return;
    await tentar(async () => {
      await ed.excluir(e);
      aoEscolher?.(coerce(undefined));
    }, "Edição excluída.");
  };
  const escolher = (id: number | null) => {
    ed.escolher(id);
    aoEscolher?.(coerce([...ed.minhas, ...ed.publicas].find((e) => e.id === id)?.valor));
  };

  /** O RODAPÉ: o seletor das edições (fora da edição) ou a barra da edição (editando). */
  const rodape = (o: {
    onEditar: () => void;
    disabled?: boolean;
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
      <SeletorEdicoes
        minhas={ed.minhas}
        publicas={ed.publicas}
        atual={ed.atual}
        padraoId={ed.padraoId}
        disabled={o.disabled || ed.gravando}
        onEditar={o.onEditar}
        onEscolher={escolher}
        onPadrao={() => tentar(() => ed.definirPadrao(ed.atual?.id ?? null), ed.atual ? `"${ed.atual.nome}" é a sua padrão.` : "A tabela abre no padrão do sistema.")}
        onExcluir={excluir}
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

  return { salvo, layout, editando, editar: (base: L) => setRascunho(base), mudar, rodape, camadas };
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
