"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { AbaKey } from "@/lib/abas";
import { ABAS_FONTE, ehCodigoGeral, type EscopoTelas, type ModoUnidades } from "@/lib/escopo-unidades-core";
import { type Modulo, modulosDasTelas, rotuloAba, telasDosModulos } from "@/lib/modulos-core";
import { MAX_NOME_RBAC } from "@/lib/rbac-validation";
import { predicadoBusca } from "@/lib/tabela-filtros";
import { useAbrirDaUrl } from "./AbrirDaUrl";
import { Ajuda } from "./Ajuda";
import { Avatar } from "./Avatar";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { useConfirmacao } from "./Confirmacao";
import { Checkbox, SearchField, TextField } from "./Field";
import { IconPlus, IconSave, IconTrash, IconUsers } from "./icons";
import { ListaEscolhaIds } from "./ListaEscolhaIds";
import { Modal } from "./Modal";
import { NAV_MODULOS } from "./navModulos";
import { CartaoEspaco } from "./QuadroCard";
import { Segmented } from "./Segmented";
import { SkeletonLinhas } from "./Skeleton";
import { toast } from "./Toast";
import { Switch } from "./Switch";

type Grupo = {
  id: number;
  nome: string;
  /** Os MÓDULOS que o grupo libera; `null` = grupo antigo (telas avulsas em `avulsas` até o ADM escolher). */
  modulos: string[] | null;
  avulsas: AbaKey[];
  /** As telas que o grupo ABRE hoje. */
  abas: AbaKey[];
  chat: boolean;
  modoUnidades: ModoUnidades;
  /** No modo "unidade de cadastro": as telas que veem TODAS as unidades. */
  escopoTelas: EscopoTelas;
  pcas: number[] | null;
  /** Os ORÇAMENTOS do grupo (`null` = todos). */
  orcamentos: number[] | null;
  /** As FUNÇÕES das telas desligadas no grupo ("tela.funcao"). */
  fontesAbas: string[];
  membros: number[];
  reparticoes: number[];
};
type PcaOpt = { id: number; nome: string; ano: number | null };
type Status = "ativo" | "pendente" | "inativo";
/** `outras` = as unidades de cadastro ADICIONAIS da pessoa (Usuários). */
type UserOpt = { id: number; nome: string; email: string; status: Status; reparticaoId: number | null; outras: number[] };
type RepOpt = { id: number; codigo: string; nome: string; oculto: boolean };

/** Ordem alfabética do português (acentos e caixa no lugar certo — a do banco põe "Á" depois do "Z"). */
const COLLATOR = new Intl.Collator("pt-BR", { sensitivity: "base" });
const ehGeral = (r: RepOpt) => ehCodigoGeral(r.codigo);
/** O formulário do banner (o Salvar fica no rodapé fixo do banner, fora do form). */
const FORM_ID = "form-grupo";

async function lerJson<T>(r: Response): Promise<T & { ok?: boolean; error?: string }> {
  return (await r.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
}

export function GruposAdmin() {
  const [grupos, setGrupos] = useState<Grupo[] | null>(null);
  const [pcasDisp, setPcasDisp] = useState<PcaOpt[]>([]);
  const [orcsDisp, setOrcsDisp] = useState<PcaOpt[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [repsDisp, setRepsDisp] = useState<RepOpt[]>([]);
  const [modulosDisp, setModulosDisp] = useState<Modulo[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const { confirmar, confirmacao } = useConfirmacao();

  const [editando, setEditando] = useState<Grupo | "novo" | null>(null);
  const [nome, setNome] = useState("");
  const [mods, setMods] = useState<Set<string>>(new Set());
  // O grupo ANTIGO (telas avulsas) só passa a módulos quando o ADM mexe nos módulos — salvar só o nome não muda o acesso.
  const [modsTocados, setModsTocados] = useState(false);
  const [chat, setChat] = useState(true);
  // null = TODOS os PCAs (sem restrição); o conjunto = só esses.
  const [pcasSel, setPcasSel] = useState<Set<number> | null>(null);
  const [orcsSel, setOrcsSel] = useState<Set<number> | null>(null);
  const [fontesAbas, setFontesAbas] = useState<Set<string>>(new Set());
  const [membros, setMembros] = useState<Set<number>>(new Set());
  const [reps, setReps] = useState<Set<number>>(new Set());
  const [modo, setModo] = useState<ModoUnidades>("lista");
  const [escopo, setEscopo] = useState<EscopoTelas>({});
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erroModal, setErroModal] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const r = await fetch("/api/admin/grupos");
      const j = await lerJson<{ grupos?: Grupo[]; modulos?: Modulo[]; pcas?: PcaOpt[]; orcamentos?: PcaOpt[]; usuarios?: UserOpt[]; reparticoes?: RepOpt[] }>(r);
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro ao carregar.");
      setGrupos([...(j.grupos ?? [])].sort((a, b) => COLLATOR.compare(a.nome, b.nome)));
      setModulosDisp(j.modulos ?? []);
      setPcasDisp(j.pcas ?? []);
      setOrcsDisp(j.orcamentos ?? []);
      setUsers([...(j.usuarios ?? [])].sort((a, b) => COLLATOR.compare(a.nome, b.nome)));
      setRepsDisp(j.reparticoes ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar.");
      setGrupos([]);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const geral = useMemo(() => repsDisp.find(ehGeral) ?? null, [repsDisp]);

  function abrirNovo() {
    setEditando("novo");
    setNome("");
    // Nenhum módulo pré-escolhido (o ADM escolhe de propósito); o chat liberado e os PCAs em "todos".
    setMods(new Set());
    setModsTocados(true);
    setChat(true);
    setPcasSel(null);
    setOrcsSel(null);
    setFontesAbas(new Set());
    setMembros(new Set());
    setReps(new Set());
    setModo("lista");
    setEscopo({});
    setBusca("");
    setErroModal(null);
  }
  function abrirEdicao(g: Grupo) {
    setEditando(g);
    setNome(g.nome);
    // O grupo antigo começa com os módulos cujas telas ele já abre TODAS (nunca abre a mais).
    setMods(new Set(g.modulos ?? modulosDasTelas(modulosDisp, g.avulsas)));
    setModsTocados(g.modulos != null);
    setChat(g.chat);
    setPcasSel(g.pcas == null ? null : new Set(g.pcas));
    setOrcsSel(g.orcamentos == null ? null : new Set(g.orcamentos));
    setFontesAbas(new Set(g.fontesAbas ?? []));
    setMembros(new Set(g.membros));
    setReps(new Set(g.reparticoes));
    setModo(g.modoUnidades ?? "lista");
    setEscopo(g.escopoTelas ?? {});
    setBusca("");
    setErroModal(null);
  }  // A PESQUISA DO SISTEMA abre o banner do grupo (`?abrir=<id>`), quando a lista chega.
  useAbrirDaUrl((v) => {
    const g = grupos?.find((x) => x.id === Number(v));
    if (g) abrirEdicao(g);
  }, grupos != null);

  const alternar = <T,>(set: (f: (s: Set<T>) => Set<T>) => void, id: T) =>
    set((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const usuariosFiltrados = useMemo(() => {
    const casa = predicadoBusca(busca); // vários de uma vez com ":"
    return casa ? users.filter((u) => casa([u.nome, u.email])) : users;
  }, [users, busca]);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErroModal(null);
    try {
      const novo = editando === "novo";
      const r = await fetch(novo ? "/api/admin/grupos" : `/api/admin/grupos/${(editando as Grupo).id}`, {
        method: novo ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, ...(modsTocados ? { modulos: [...mods] } : {}), chat, pcas: pcasSel == null ? null : [...pcasSel], orcamentos: orcsSel == null ? null : [...orcsSel], fontesAbas: [...fontesAbas], membros: [...membros], reparticoes: [...reps], modoUnidades: modo, escopoTelas: escopo }),
      });
      const j = await lerJson<object>(r);
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro ao salvar.");
      setEditando(null);
      toast.success(novo ? `Grupo "${nome.trim()}" criado.` : `Grupo "${nome.trim()}" salvo.`);
      await carregar();
    } catch (err) {
      // O erro aparece DENTRO do modal (atrás dele ninguém o via).
      setErroModal(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(g: Grupo) {
    setExcluindo(g.id);
    try {
      // O IMPACTO antes de perguntar: a exclusão cascateia quadros de tarefas, pastas e modelos do grupo.
      const ri = await fetch(`/api/admin/grupos/${g.id}`);
      const ji = await lerJson<{ texto?: string }>(ri);
      if (!ri.ok || !ji.ok) throw new Error(ji.error ?? "Não foi possível conferir o grupo.");
      const sim = await confirmar({
        titulo: `Excluir o grupo "${g.nome}"?`,
        texto: ji.texto,
        confirmar: "Excluir grupo",
        perigo: true,
      });
      if (!sim) return;
      const r = await fetch(`/api/admin/grupos/${g.id}?confirmar=1`, { method: "DELETE" });
      const j = await lerJson<object>(r);
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro ao excluir.");
      toast.success(`Grupo "${g.nome}" excluído.`);
      await carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir.");
    } finally {
      setExcluindo(null);
    }
  }

  if (grupos === null) {
    return (
      <div className="rounded-card border border-border p-[var(--pad-card)]">
        <SkeletonLinhas linhas={4} />
      </div>
    );
  }


  // No modo "unidade de cadastro": quem do grupo não tem a unidade de cadastro (não verá dado nenhum).
  const semUnidade = modo === "cadastro" ? users.filter((u) => membros.has(u.id) && u.reparticaoId == null && u.outras.length === 0) : [];
  // As telas do grupo (as dos módulos escolhidos): no modo "de cadastro", cada uma escolhe as unidades que vê.
  const telasGrupo = telasDosModulos(modulosDisp, [...mods]);

  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          O grupo reúne pessoas, os MÓDULOS que elas abrem (o papel diz o que fazem nas telas), o chat, os PCAs e as
          UNIDADES (de quais unidades veem os dados).
        </p>
        <Button onClick={abrirNovo} icon={<IconPlus className="h-[18px] w-[18px]" />}>
          Novo grupo
        </Button>
      </div>

      {erro && <Callout kind="danger">{erro}</Callout>}

      {grupos.length === 0 ? (
        <div className="rounded-card border border-dashed border-border-2 p-10 text-center text-sm text-muted">
          Nenhum grupo criado ainda.
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-[var(--gap-block)]">
          {grupos.map((g) => {
            const telas = NAV_MODULOS.filter((m) => g.abas.includes(m.aba));
            const nMods = g.modulos?.length;
            return (
              <CartaoEspaco
                key={g.id}
                ariaLabel={`Editar o grupo ${g.nome}`}
                onClick={() => abrirEdicao(g)}
                sobretitulo={`Grupo · ${nMods == null ? "telas avulsas" : `${nMods} módulo(s)`} · ${telas.length} tela(s)`}
                selo={telas.length === 0 ? <Badge tone="amber">Sem telas</Badge> : !g.chat ? <Badge tone="slate">Chat bloqueado</Badge> : undefined}
                nome={g.nome}
                capa={
                  <div className="relative grid aspect-video w-full place-items-center overflow-hidden rounded-lg bg-accent-soft" title={telas.map((t) => t.label).join(", ") || "Nenhuma tela"}>
                    {telas.length ? (
                      <div className="flex max-w-[70%] flex-wrap justify-center gap-1.5">
                        {telas.map((t) => (
                          <span key={t.aba} className="grid h-8 w-8 place-items-center rounded-control bg-surface text-accent shadow-ring">
                            <t.Icon className="h-4 w-4" />
                          </span>
                        ))}
                      </div>
                    ) : (
                      <IconUsers className="h-8 w-8 text-accent/60" />
                    )}
                  </div>
                }
                metricas={[
                  { rotulo: "Pessoas", valor: String(g.membros.length) },
                  { rotulo: "Unidades", valor: g.modoUnidades === "cadastro" ? "De cadastro" : geral && g.reparticoes.includes(geral.id) ? "Todas" : String(g.reparticoes.length) },
                  { rotulo: "PCAs", valor: g.pcas == null ? "Todos" : String(g.pcas.length) },
                ]}
                canto={
                  <span className="absolute top-3.5 right-3.5">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => excluir(g)}
                      loading={excluindo === g.id}
                      aria-label={`Excluir o grupo ${g.nome}`}
                      title="Excluir o grupo"
                      style={{ color: "var(--danger)" }}
                      icon={<IconTrash className="h-3.5 w-3.5" />}
                    />
                  </span>
                }
              />
            );
          })}
        </div>
      )}

      <Modal
        open={!!editando}
        onClose={() => setEditando(null)}
        titulo={editando === "novo" ? "Novo grupo" : "Editar grupo"}
        size="lg"
        bloqueado={salvando}
        rodape={
          <div className="flex justify-end">
            <Button type="submit" form={FORM_ID} loading={salvando} icon={<IconSave className="h-4 w-4" />}>
              Salvar
            </Button>
          </div>
        }
      >
        <form id={FORM_ID} onSubmit={salvar} className="space-y-[var(--gap-block)]">
          {erroModal && <Callout kind="danger">{erroModal}</Callout>}
          <section className="space-y-3 rounded-card border border-border p-[var(--pad-card)]">
            <TextField label="Nome do grupo" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={MAX_NOME_RBAC} required />
            <Switch checked={chat} onChange={setChat} label="Chat liberado no grupo" dica="Sem ele, as pessoas não conversam pelo chat ao vivo neste grupo (nem no privado, se não tiverem outro grupo com o chat). O chat também precisa estar ligado em Configurações → Presença e chat." />
          </section>
          <section className="space-y-3 rounded-card border border-border p-[var(--pad-card)]">
            <fieldset>
              <legend className="mb-2 block text-[13.5px] font-bold text-text">Módulos do grupo · {mods.size} selecionado(s)</legend>
              <div className="grid gap-1 rounded-control border border-border p-2 sm:grid-cols-2">
                {modulosDisp.map((m) => (
                  <div key={m.id} className="rounded-control p-1.5 hover:bg-surface-2">
                    <Checkbox
                      checked={mods.has(m.id)}
                      onChange={() => {
                        setModsTocados(true);
                        alternar(setMods, m.id);
                      }}
                      label={
                        <span className="min-w-0">
                          <span className="block text-[13px] font-medium text-text">{m.nome}</span>
                          <span className="block text-[11.5px] text-muted">{m.telas.map(rotuloAba).join(", ") || "Sem telas"}</span>
                        </span>
                      }
                    />
                  </div>
                ))}
              </div>
              <MudancaTelas grupo={editando === "novo" ? null : editando} tocados={modsTocados} telas={telasDosModulos(modulosDisp, [...mods])} />
            </fieldset>
          </section>
          <section className="space-y-3 rounded-card border border-border p-[var(--pad-card)]">
            <div>
              <span className="mb-2 block text-[13.5px] font-bold text-text">
                Pessoas do grupo · {membros.size} selecionada(s)
              </span>
              <SearchField value={busca} onChange={(e) => setBusca(e.target.value)} onClear={() => setBusca("")} placeholder="Buscar pessoa..." />
              <div className="mt-2 max-h-[280px] space-y-1 overflow-y-auto rounded-control border border-border p-2">
                {usuariosFiltrados.map((u) => (
                  <div key={u.id} className="rounded-control p-1.5 hover:bg-surface-2">
                    <Checkbox
                      checked={membros.has(u.id)}
                      onChange={() => alternar(setMembros, u.id)}
                      label={
                        <span className="flex items-center gap-2.5">
                          <Avatar nome={u.nome} size="sm" />
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate text-[13px] font-medium text-text">{u.nome}</span>
                              {u.status === "pendente" && <Badge tone="amber">Pendente</Badge>}
                              {u.status === "inativo" && <Badge tone="slate">Inativo</Badge>}
                            </span>
                            <span className="block truncate text-[11px] text-muted">{u.email}</span>
                          </span>
                        </span>
                      }
                    />
                  </div>
                ))}
                {usuariosFiltrados.length === 0 && (
                  <p className="p-2 text-center text-[12px] text-faint">Nenhuma pessoa encontrada.</p>
                )}
              </div>
            </div>
          </section>
          <section className="space-y-3 rounded-card border border-border p-[var(--pad-card)]">
            <div>
              <div className="mb-2 flex items-center gap-1.5">
                <span className="text-[13.5px] font-bold text-text">
                  Unidades do grupo{modo === "lista" ? ` · ${reps.size} selecionada(s)` : ""}
                </span>
                <Ajuda titulo="Unidades do grupo" compacta>
                  <p>
                    <b>Unidades escolhidas</b>: todas as pessoas do grupo veem os dados das unidades marcadas (a "Geral" = todas).
                  </p>
                  <p className="mt-2">
                    <b>Unidade de cadastro de cada pessoa</b>: cada pessoa vê só as unidades em que trabalha (o cadastro dela em
                    Usuários — pode ter várias). Quem não tem unidade de cadastro não vê dado nenhum. O que cada aba mostra fica em <b>Acesso às unidades por aba</b>.
                  </p>
                </Ajuda>
              </div>
              <Segmented
                ariaLabel="De onde vêm as unidades"
                value={modo}
                onChange={setModo}
                className="mb-2"
                options={[
                  { value: "lista", label: "Unidades escolhidas", curto: "Escolhidas" },
                  { value: "cadastro", label: "Unidade de cadastro de cada pessoa", curto: "De cadastro" },
                ]}
              />
              {modo === "cadastro" ? (
                semUnidade.length > 0 ? (
                  <Callout kind="warn">
                    {semUnidade.length} pessoa(s) do grupo sem unidade de cadastro não verão dado nenhum:{" "}
                    {semUnidade.map((u) => u.nome).join(", ")}. Defina a unidade em Usuários.
                  </Callout>
                ) : (
                  <p className="rounded-control border border-dashed border-border-2 p-3 text-[12px] text-muted">
                    Cada pessoa verá os dados da unidade do próprio cadastro.
                  </p>
                )
              ) : repsDisp.length === 0 ? (
                <p className="rounded-control border border-dashed border-border-2 p-3 text-[12px] text-faint">
                  Nenhuma unidade cadastrada. Cadastre em Órgãos e Unidades.
                </p>
              ) : (
                <div className="max-h-[200px] space-y-1 overflow-y-auto rounded-control border border-border p-2">
                  {repsDisp.map((r) => (
                    <div key={r.id} className="rounded-control p-1.5 hover:bg-surface-2">
                      <Checkbox
                        checked={reps.has(r.id)}
                        onChange={() => alternar(setReps, r.id)}
                        label={
                          <span className="flex items-center gap-2">
                            <span className="font-mono text-[10.5px] text-faint">{r.codigo}</span>
                            <span className="min-w-0 truncate text-[13px] text-text">{r.nome}</span>
                            {ehGeral(r) && <Badge tone="blue">Todas as unidades</Badge>}
                            {r.oculto && <Badge tone="slate">Oculta</Badge>}
                          </span>
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
          <section className="space-y-3 rounded-card border border-border p-[var(--pad-card)]">
            <AcessoPorAba telas={telasGrupo} escopo={escopo} somas={fontesAbas} onEscopo={setEscopo} onSomas={setFontesAbas} />
          </section>
          {(telasGrupo.includes("pca") || telasGrupo.includes("orcamento")) && (
          <section className="space-y-3 rounded-card border border-border p-[var(--pad-card)]">
            {telasGrupo.includes("pca") && (
              <ListaEscolhaIds titulo="PCAs do grupo" todos="Todos os PCAs (também os que forem criados)" vazio="Nenhum PCA cadastrado." aviso="Sem nenhum PCA, as pessoas do grupo não veem nenhum PCA." opcoes={pcasDisp} valor={pcasSel} onChange={setPcasSel} />
            )}
            {telasGrupo.includes("orcamento") && (
              <ListaEscolhaIds titulo="Orçamentos do grupo" todos="Todos os orçamentos (também os que forem importados)" vazio="Nenhum orçamento importado." aviso="Sem nenhum orçamento, as pessoas do grupo não veem nenhum orçamento." opcoes={orcsDisp} valor={orcsSel} onChange={setOrcsSel} />
            )}
          </section>
          )}
        </form>
      </Modal>
      {confirmacao}
    </div>
  );
}

/** Acesso às unidades em CADA ABA de cada tela do grupo — uma configuração só: as unidades da PESSOA (o seletor do
 * cabeçalho escolhe entre elas), a SOMA delas (o seletor fica travado) ou TODAS as unidades (ex.: só a Mesa do PCA). */
function AcessoPorAba({ telas, escopo, somas, onEscopo, onSomas }: { telas: AbaKey[]; escopo: EscopoTelas; somas: Set<string>; onEscopo: (v: EscopoTelas) => void; onSomas: (v: Set<string>) => void }) {
  if (!telas.length) return null;
  const linhas = (t: AbaKey) =>
    ABAS_FONTE[t]?.length ? ABAS_FONTE[t].map((x) => ({ chave: `${t}.${x.aba}`, rotulo: x.rotulo, soma: true })) : [{ chave: t, rotulo: rotuloAba(t), soma: false }];
  const valor = (c: string) => (escopo[c] === "todas" ? "todas" : somas.has(c) ? "soma" : "pessoa");
  const mudar = (c: string, v: string) => {
    const e: Record<string, "todas"> = { ...escopo };
    const s = new Set(somas);
    delete e[c];
    s.delete(c);
    if (v === "todas") e[c] = "todas";
    if (v === "soma") s.add(c);
    onEscopo(e);
    onSomas(s);
  };
  const n = telas.flatMap(linhas).filter((l) => valor(l.chave) !== "pessoa").length;
  return (
    <fieldset>
      <legend className="mb-2 flex items-center gap-1.5 text-[13.5px] font-bold text-text">
        Acesso às unidades por aba{n ? ` · ${n} alterada(s)` : ""}
        <Ajuda titulo="Acesso às unidades por aba" compacta>
          <p>
            <b>Da pessoa</b> (padrão): os dados das unidades da pessoa; o seletor do cabeçalho escolhe entre elas. <b>Soma</b>:
            sempre a soma das unidades da pessoa, com o seletor travado. <b>Todas</b>: os dados de todas as unidades só naquela aba, sem o filtro do cabeçalho (o cabeçalho segue com as unidades do grupo; filtre pela coluna Unidade da tabela) —
            ex.: liberar a Mesa do PCA e manter o Dashboard e o Orçamento na unidade da pessoa).
          </p>
        </Ajuda>
      </legend>
      <div className="space-y-2 rounded-control border border-border p-2">
        {telas.map((t) => (
          <div key={t} className="rounded-control p-1.5">
            {ABAS_FONTE[t]?.length ? <span className="mb-1 block text-[12.5px] font-semibold text-text">{rotuloAba(t)}</span> : null}
            <div className="space-y-1.5">
              {linhas(t).map((l) => (
                <div key={l.chave} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[13px] text-text">{l.rotulo}</span>
                  <Segmented
                    ariaLabel={`Unidades em ${l.rotulo}`}
                    value={valor(l.chave)}
                    onChange={(v) => mudar(l.chave, v)}
                    options={[
                      { value: "pessoa", label: "Da pessoa", dica: "As unidades da pessoa; o seletor do cabeçalho escolhe entre elas." },
                      ...(l.soma ? [{ value: "soma", label: "Soma", dica: "A soma das unidades da pessoa; o seletor do cabeçalho fica travado." }] : []),
                      { value: "todas", label: "Todas", dica: "Os dados de todas as unidades nesta aba; o cabeçalho segue com as do grupo e a tabela filtra pela coluna Unidade." },
                    ]}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </fieldset>
  );
}

/** O que o grupo passa a abrir com os módulos escolhidos — o grupo ANTIGO (telas avulsas) mostra o que ganha e o que perde. */
function MudancaTelas({ grupo, tocados, telas }: { grupo: Grupo | null; tocados: boolean; telas: AbaKey[] }) {
  const lista = (l: readonly AbaKey[]) => l.map(rotuloAba).join(", ");
  if (grupo && grupo.modulos == null) {
    if (!tocados)
      return <p className="mt-1.5 text-[12px] text-[var(--warn)]">Grupo com telas avulsas ({lista(grupo.avulsas) || "nenhuma"}) — escolha os módulos para passar a usá-los.</p>;
    const ganha = telas.filter((t) => !grupo.avulsas.includes(t));
    const perde = grupo.avulsas.filter((t) => !telas.includes(t));
    if (ganha.length || perde.length)
      return (
        <p className="mt-1.5 text-[12px] text-[var(--warn)]">
          {ganha.length ? `Passa a abrir: ${lista(ganha)}. ` : ""}
          {perde.length ? `Deixa de abrir: ${lista(perde)}.` : ""}
        </p>
      );
  }
  if (!telas.length) return <p className="mt-1.5 text-[12px] text-[var(--warn)]">Sem nenhum módulo, as pessoas do grupo não veem as telas.</p>;
  return <p className="mt-1.5 text-[12px] text-muted">Abre: {lista(telas)}. O papel de cada pessoa diz o que ela faz nelas; os módulos ficam em Configurações → Módulos.</p>;
}
