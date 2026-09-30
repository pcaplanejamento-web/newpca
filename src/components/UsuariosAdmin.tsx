"use client";

import { useCallback, useEffect, useState } from "react";
import { filtrarMatricula, filtrarNome } from "@/lib/cadastro-core";
import { dataBR } from "@/lib/format";
import type { OpcaoPapel } from "@/lib/papeis";
import { textoResumoCapacidades } from "@/lib/papeis-core";
import type { UnidadeTrabalho } from "@/lib/reparticoes";
import { AcessoDaPessoa } from "./AcessoDaPessoa";
import { Ajuda, TopicoAjuda } from "./Ajuda";
import { Avatar } from "./Avatar";
import { Badge, type Tone } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { useConfirmacao } from "./Confirmacao";
import { type Column, DataTable } from "./DataTable";
import { inputCls, labelCls, selectCls } from "./formStyles";
import { SelectField } from "./Field";
import { type GrupoOpcao, GruposDaPessoa } from "./GruposDaPessoa";
import { IconAlert, IconBadgeCheck, IconBriefcase, IconCheck, IconPencil, IconSave, IconShield, IconSpinner } from "./icons";
import { Modal } from "./Modal";
import { CargosAdmin } from "./CargosAdmin";
import { CelulaLista } from "./CelulaLista";
import { OpcoesUnidades } from "./OpcoesUnidades";
import { SkeletonLinhas } from "./Skeleton";
import { toast } from "./Toast";

type Status = "ativo" | "pendente" | "inativo";
type U = {
  id: number;
  nome: string;
  apelido: string | null;
  email: string;
  emailVerificado: boolean;
  matricula: string | null;
  cargo: string | null;
  reparticaoId: number | null;
  unidade: string | null;
  foto: string | null;
  /** O papel (Configurações → Papéis); `null` = sem papel (nenhuma tela abre). */
  papelId: number | null;
  /** Os grupos da pessoa (ids). */
  grupos: number[];
  status: Status;
  criadoEm: string | null;
};

const STATUS_TONE: Record<Status, Tone> = { ativo: "emerald", pendente: "amber", inativo: "slate" };
const STATUS_LABEL: Record<Status, string> = { ativo: "Ativo", pendente: "Pendente", inativo: "Inativo" };
/** O que o Administrador faz — a confirmação da troca e a ajuda da tela dizem o mesmo. */
const DESCRICAO_ADMIN = "vê e altera TUDO, inclusive a Administração (usuários, grupos, permissões, papéis e configurações)";
/** O que um papel faz, numa linha (confirmação e ajuda): o Administrador por extenso; os demais pelas telas e ações. */
const descricaoPapel = (p: OpcaoPapel) => (p.chave === "admin" ? DESCRICAO_ADMIN : textoResumoCapacidades(p.capacidades));
const mesmosIds = (a: readonly number[], b: readonly number[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

export function UsuariosAdmin({ meuId }: { meuId: number }) {
  const [lista, setLista] = useState<U[] | null>(null);
  const [unidades, setUnidades] = useState<UnidadeTrabalho[]>([]);
  const [cargos, setCargos] = useState<string[]>([]);
  const [papeis, setPapeis] = useState<OpcaoPapel[]>([]);
  const [grupos, setGrupos] = useState<GrupoOpcao[]>([]);
  const [verCargos, setVerCargos] = useState(false);
  const [verAcesso, setVerAcesso] = useState<U | null>(null);
  const [aprovando, setAprovando] = useState<U | null>(null);
  const [apPapel, setApPapel] = useState("");
  const [apGrupos, setApGrupos] = useState<number[]>([]);
  const [salvandoAp, setSalvandoAp] = useState(false);
  const [erroAp, setErroAp] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editando, setEditando] = useState<U | null>(null);
  const [edNome, setEdNome] = useState("");
  const [edEmail, setEdEmail] = useState("");
  const [edMatricula, setEdMatricula] = useState("");
  const [edCargo, setEdCargo] = useState("");
  const [edUnidade, setEdUnidade] = useState("");
  const [edGrupos, setEdGrupos] = useState<number[]>([]);
  const [salvandoEd, setSalvandoEd] = useState(false);
  const [erroEd, setErroEd] = useState<string | null>(null);
  const { confirmar, confirmacao } = useConfirmacao();

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const r = await fetch("/api/admin/usuarios");
      const j = (await r.json()) as {
        ok?: boolean;
        error?: string;
        usuarios?: U[];
        unidades?: UnidadeTrabalho[];
        cargos?: { nome: string }[];
        papeis?: OpcaoPapel[];
        grupos?: GrupoOpcao[];
      };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro ao carregar usuários.");
      setLista(j.usuarios ?? []);
      setUnidades(j.unidades ?? []);
      setCargos((j.cargos ?? []).map((c) => c.nome));
      setPapeis(j.papeis ?? []);
      setGrupos(j.grupos ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar.");
      setLista([]);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  /** Executa a ação na linha (spinner na própria linha) e diz o desfecho num aviso flutuante — o erro não fica
   * escondido no topo da tabela. */
  async function acao(id: number, init: RequestInit, sucesso: string) {
    setBusyId(id);
    try {
      const r = await fetch(`/api/admin/usuarios/${id}`, init);
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Não foi possível concluir — tente de novo.");
      toast.success(sucesso);
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível concluir — tente de novo.");
    } finally {
      setBusyId(null);
    }
  }

  const patch = (id: number, dados: { papelId?: number; grupos?: number[]; status?: Status }, sucesso: string) =>
    acao(
      id,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dados),
      },
      sucesso,
    );

  const papelDe = (u: U) => papeis.find((p) => p.id === u.papelId) ?? null;
  const gruposDe = (u: U) => u.grupos.map((id) => grupos.find((g) => g.id === id)).filter((g): g is GrupoOpcao => !!g);

  /** Trocar o PAPEL confirma antes (é mudança de privilégio): dar ou tirar o Administrador em destaque. */
  async function trocarPapel(u: U, novoId: number) {
    const novo = papeis.find((p) => p.id === novoId);
    if (!novo || novoId === u.papelId) return;
    const eraAdmin = papelDe(u)?.chave === "admin";
    const vaiAdmin = novo.chave === "admin";
    const ok = await confirmar({
      titulo: vaiAdmin ? `Tornar ${u.nome} Administrador?` : eraAdmin ? `Retirar o Administrador de ${u.nome}?` : `Mudar o papel de ${u.nome} para ${novo.nome}?`,
      texto: vaiAdmin
        ? `O Administrador ${DESCRICAO_ADMIN}.`
        : `${eraAdmin ? "A pessoa perde a Administração. " : ""}${novo.nome}: ${descricaoPapel(novo)}. As telas continuam as que os grupos da pessoa liberam.`,
      confirmar: vaiAdmin ? "Tornar Administrador" : `Mudar para ${novo.nome}`,
      perigo: vaiAdmin || eraAdmin,
    });
    if (ok) await patch(u.id, { papelId: novo.id }, `${u.nome} agora é ${novo.nome}.`);
  }

  /** APROVAR = liberar a entrada já com o papel (o de cadastro vem escolhido) e os grupos (sem grupo, não vê dados). */
  function abrirAprovacao(u: U) {
    setAprovando(u);
    setApPapel(String(u.papelId ?? papeis.find((p) => p.padraoCadastro)?.id ?? ""));
    setApGrupos(u.grupos);
    setErroAp(null);
  }

  async function aprovar() {
    if (!aprovando || !apPapel) return;
    setSalvandoAp(true);
    setErroAp(null);
    try {
      const r = await fetch(`/api/admin/usuarios/${aprovando.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ativo", papelId: Number(apPapel), grupos: apGrupos }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Não foi possível aprovar — tente de novo.");
      toast.success(`Acesso de ${aprovando.nome} liberado.`);
      setAprovando(null);
      await carregar();
    } catch (e) {
      setErroAp(e instanceof Error ? e.message : "Não foi possível aprovar — tente de novo.");
    } finally {
      setSalvandoAp(false);
    }
  }

  async function recusar(u: U) {
    const ok = await confirmar({
      titulo: `Recusar o cadastro de ${u.nome}?`,
      texto: "O cadastro é apagado e a pessoa não entra. Ela pode se cadastrar de novo, se for o caso.",
      confirmar: "Recusar",
      perigo: true,
    });
    if (ok) await acao(u.id, { method: "DELETE" }, `Cadastro de ${u.nome} recusado.`);
  }

  async function desativar(u: U) {
    const ok = await confirmar({
      titulo: `Desativar ${u.nome}?`,
      texto: "A pessoa perde o acesso na hora e não consegue mais entrar. O cadastro e o histórico ficam; dá para reativar depois.",
      confirmar: "Desativar",
      perigo: true,
    });
    if (ok) await patch(u.id, { status: "inativo" }, `${u.nome} foi desativado(a).`);
  }

  async function excluir(u: U) {
    const ok = await confirmar({
      titulo: `Excluir ${u.nome}?`,
      texto: "A conta é apagada e a pessoa sai de todos os grupos. O histórico mantém o nome de quem fez cada alteração. Não dá para desfazer — para só tirar o acesso, prefira Desativar.",
      confirmar: "Excluir",
      perigo: true,
    });
    if (ok) await acao(u.id, { method: "DELETE" }, `${u.nome} foi excluído(a).`);
  }

  function abrirEdicao(u: U) {
    setEditando(u);
    setEdNome(u.nome);
    setEdEmail(u.email);
    setEdMatricula(u.matricula ?? "");
    setEdCargo(u.cargo ?? "");
    setEdUnidade(u.reparticaoId == null ? "" : String(u.reparticaoId));
    setEdGrupos(u.grupos);
    setErroEd(null);
  }

  async function salvarEdicao(e: React.FormEvent) {
    e.preventDefault();
    if (!editando) return;
    setSalvandoEd(true);
    setErroEd(null);
    try {
      const r = await fetch(`/api/admin/usuarios/${editando.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // Só o que MUDOU vai (um dado antigo fora do padrão de hoje continua valendo enquanto não for trocado).
        body: JSON.stringify({
          ...(edNome.trim() !== editando.nome ? { nome: edNome } : {}),
          ...(edEmail.trim().toLowerCase() !== editando.email ? { email: edEmail } : {}),
          ...(edMatricula !== (editando.matricula ?? "") ? { matricula: edMatricula } : {}),
          ...(edCargo !== (editando.cargo ?? "") ? { cargo: edCargo } : {}),
          // Só a unidade que MUDOU vai (manter uma unidade hoje oculta sempre vale).
          ...(edUnidade !== (editando.reparticaoId == null ? "" : String(editando.reparticaoId)) ? { reparticaoId: edUnidade ? Number(edUnidade) : null } : {}),
          // Os grupos vão inteiros, só quando mudaram (a rota troca todos num lote).
          ...(!mesmosIds(edGrupos, editando.grupos) ? { grupos: edGrupos } : {}),
        }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro ao salvar.");
      setEditando(null);
      await carregar();
    } catch (err) {
      setErroEd(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSalvandoEd(false);
    }
  }

  if (lista === null) {
    return (
      <div className="rounded-card border border-border p-4">
        <SkeletonLinhas linhas={6} />
      </div>
    );
  }

  const pendentes = lista.filter((u) => u.status === "pendente").length;

  const colunas: Column<U>[] = [
    {
      key: "usuario",
      header: "Usuário",
      minWidth: 240,
      filter: "none",
      value: (u) => `${u.nome}${u.apelido ? ` ${u.apelido}` : ""}${u.cargo ? ` ${u.cargo}` : ""}`,
      render: (u) => (
        <div className="flex items-center gap-2.5">
          <Avatar nome={u.nome} foto={u.foto} />
          <div className="min-w-0">
            <div className="font-medium text-text">
              {u.nome} {u.id === meuId && <span className="text-faint">(você)</span>}
            </div>
            {u.apelido && <div className="text-[11px] text-text-2">Apelido: {u.apelido}</div>}
            <div className="flex items-center gap-1 text-xs text-muted">
              <span className="break-all">{u.email}</span>
              {u.emailVerificado && <IconBadgeCheck className="h-3.5 w-3.5 shrink-0 text-[var(--ok)]" aria-label="E-mail confirmado" />}
            </div>
            {(u.cargo || u.matricula) && (
              <div className="text-[11px] text-faint">{[u.cargo, u.matricula && `Matrícula ${u.matricula}`].filter(Boolean).join(" · ")}</div>
            )}
            {u.criadoEm && <div className="text-[11px] text-faint">desde {dataBR(u.criadoEm)}</div>}
          </div>
        </div>
      ),
    },
    {
      key: "unidade",
      header: "Unidade",
      minWidth: 180,
      value: (u) => u.unidade ?? "—",
      render: (u) => <span className={u.unidade ? "text-text-2" : "text-faint"}>{u.unidade ?? "—"}</span>,
    },
    {
      key: "papel",
      header: "Papel",
      minWidth: 170,
      value: (u) => papelDe(u)?.nome ?? "Sem papel",
      render: (u) => (
        <select
          value={u.papelId == null ? "" : String(u.papelId)}
          disabled={u.id === meuId || busyId === u.id}
          onChange={(e) => e.target.value && trocarPapel(u, Number(e.target.value))}
          className={selectCls}
          aria-label={`Papel de ${u.nome}`}
          title={papelDe(u) ? descricaoPapel(papelDe(u) as OpcaoPapel) : "Sem papel: nenhuma tela abre"}
        >
          {u.papelId == null && (
            <option value="" disabled>
              Sem papel
            </option>
          )}
          {papeis.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: "grupos",
      header: "Grupos",
      minWidth: 170,
      value: (u) => gruposDe(u).map((g) => g.nome).join(", ") || "Sem grupo",
      valores: (u) => {
        const nomes = gruposDe(u).map((g) => g.nome);
        return nomes.length ? nomes : ["Sem grupo"];
      },
      render: (u) => {
        const nomes = gruposDe(u).map((g) => g.nome);
        if (nomes.length) return <CelulaLista valores={nomes} max={2} />;
        // O Administrador vê tudo sem grupo; para os demais, sem grupo = não vê dado nenhum.
        return papelDe(u)?.chave === "admin" ? (
          <span className="text-faint" title="O Administrador vê tudo, com ou sem grupo">
            —
          </span>
        ) : (
          <span title="Sem grupo, a pessoa não abre nenhuma tela nem vê dados">
            <Badge tone="amber">Sem grupo</Badge>
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      minWidth: 120,
      value: (u) => STATUS_LABEL[u.status],
      render: (u) => <Badge tone={STATUS_TONE[u.status]}>{STATUS_LABEL[u.status]}</Badge>,
    },
    {
      key: "acoes",
      header: "Ações",
      align: "right",
      minWidth: 220,
      filter: "none",
      render: (u) => {
        const souEu = u.id === meuId;
        const busy = busyId === u.id;
        return (
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {busy && <IconSpinner className="h-4 w-4 text-faint" />}
            <Button variant="secondary" disabled={busy} onClick={() => abrirEdicao(u)} icon={<IconPencil className="h-3.5 w-3.5" />}>
              Editar
            </Button>
            {u.status === "pendente" && (
              <Button disabled={busy} onClick={() => abrirAprovacao(u)} icon={<IconCheck className="h-3.5 w-3.5" />}>
                Aprovar
              </Button>
            )}
            {u.status === "pendente" && !souEu && (
              <Button variant="danger" disabled={busy} onClick={() => recusar(u)}>
                Recusar
              </Button>
            )}
            {u.status === "ativo" && !souEu && (
              <Button variant="secondary" disabled={busy} onClick={() => desativar(u)}>
                Desativar
              </Button>
            )}
            {u.status === "inativo" && (
              <Button variant="secondary" disabled={busy} onClick={() => patch(u.id, { status: "ativo" }, `${u.nome} foi reativado(a).`)}>
                Reativar
              </Button>
            )}
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setVerAcesso(u)}
              icon={<IconShield className="h-4 w-4" />}
              aria-label={`Ver o acesso de ${u.nome}`}
              title="Ver acesso: o que a pessoa abre e faz em cada grupo"
            />
            {!souEu && u.status !== "pendente" && (
              <Button variant="danger" disabled={busy} onClick={() => excluir(u)}>
                Excluir
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="flex items-center justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={() => setVerCargos(true)} icon={<IconBriefcase className="h-4 w-4" />}>
          Cargos e funções
        </Button>
        <Ajuda titulo="Usuários e papéis">
          <p>
            O GRUPO (com a permissão dele) decide QUAIS telas a pessoa abre e as unidades que ela vê; o PAPEL decide o que ela faz
            nelas. Os papéis se criam e se editam em Configurações → Papéis.
          </p>
          {papeis.map((p) => (
            <TopicoAjuda key={p.id} titulo={p.nome}>
              {p.chave === "admin" ? `O Administrador ${DESCRICAO_ADMIN}.` : `${p.descricao ? `${p.descricao} ` : ""}(${descricaoPapel(p)})`}
            </TopicoAjuda>
          ))}
          <p>Aprovar libera a entrada já com o papel e os grupos da pessoa (sem grupo, ela entra mas não vê dados). “Ver acesso” mostra o que ela abre e faz em cada grupo.</p>
          <p>Em “Cargos e funções” você cadastra a lista que a pessoa escolhe no cadastro; em “Editar” você troca o de qualquer usuário.</p>
        </Ajuda>
      </div>
      {pendentes > 0 && (
        <Callout kind="warn" icon={<IconAlert className="h-4 w-4" />}>
          {pendentes} cadastro(s) aguardando sua aprovação.
        </Callout>
      )}
      {erro && <Callout kind="danger">{erro}</Callout>}

      <DataTable columns={colunas} rows={lista} getKey={(u) => u.id} pageSize={12} minWidth={900} />

      {/* Modal: editar dados do usuário */}
      <Modal open={!!editando} onClose={() => setEditando(null)} titulo="Editar usuário">
        <form onSubmit={salvarEdicao}>
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Nome completo</label>
              <input className={inputCls} value={edNome} onChange={(e) => setEdNome(filtrarNome(e.target.value))} maxLength={120} required />
            </div>
            <div>
              <label className={labelCls}>E-mail</label>
              <input type="email" className={inputCls} value={edEmail} onChange={(e) => setEdEmail(e.target.value.replace(/\s/g, ""))} maxLength={160} required />
            </div>
            <div>
              <label className={labelCls}>Matrícula</label>
              <input
                className={inputCls}
                value={edMatricula}
                onChange={(e) => setEdMatricula(filtrarMatricula(e.target.value))}
                inputMode="numeric"
                placeholder="Opcional — só números"
              />
            </div>
            <SelectField id="ed-cargo" label="Cargo ou função" value={edCargo} onChange={(e) => setEdCargo(e.target.value)} denso>
              <option value="">Nenhum</option>
                {/* O cargo atual continua na lista mesmo que tenha saído do cadastro. */}
              {editando?.cargo && !cargos.includes(editando.cargo) && <option value={editando.cargo}>{editando.cargo} (fora da lista)</option>}
              {cargos.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </SelectField>
            <SelectField id="ed-unidade" label="Unidade em que trabalha" value={edUnidade} onChange={(e) => setEdUnidade(e.target.value)} denso>
              <option value="">Nenhuma</option>
              {/* A unidade atual continua na lista mesmo que hoje esteja oculta. */}
              {editando?.reparticaoId != null && !unidades.some((x) => x.id === editando.reparticaoId) && (
                <option value={editando.reparticaoId}>{editando.unidade ?? `Unidade ${editando.reparticaoId}`}</option>
              )}
              <OpcoesUnidades unidades={unidades} />
            </SelectField>
            <fieldset>
              <legend className={labelCls}>Grupos</legend>
              <GruposDaPessoa grupos={grupos} selecionados={edGrupos} onChange={setEdGrupos} disabled={salvandoEd} />
              {edGrupos.length === 0 && editando && papelDe(editando)?.chave !== "admin" && (
                <p className="mt-1 text-[12.5px] text-[color:var(--warn)]">Sem grupo, a pessoa não abre nenhuma tela nem vê dados.</p>
              )}
            </fieldset>
          </div>
          {erroEd && (
            <Callout kind="danger" icon={<IconAlert className="h-4 w-4" />} className="mt-3">
              {erroEd}
            </Callout>
          )}
          <div className="mt-4 flex gap-2">
            <Button type="submit" loading={salvandoEd} icon={<IconSave className="h-[18px] w-[18px]" />} className="flex-1">
              Salvar
            </Button>
            <Button variant="secondary" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>
      {/* Aprovar: libera a entrada com o papel e os grupos (numa gravação só) */}
      <Modal
        open={!!aprovando}
        onClose={() => setAprovando(null)}
        bloqueado={salvandoAp}
        titulo={aprovando ? `Aprovar o cadastro de ${aprovando.nome}` : "Aprovar o cadastro"}
        size="md"
        rodape={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAprovando(null)} disabled={salvandoAp}>
              Cancelar
            </Button>
            <Button onClick={() => void aprovar()} loading={salvandoAp} disabled={!apPapel} icon={<IconCheck className="h-4 w-4" />}>
              Aprovar
            </Button>
          </div>
        }
      >
        {(() => {
          const escolhido = papeis.find((p) => String(p.id) === apPapel) ?? null;
          return (
            <div className="space-y-[var(--gap-block)]">
              <p className="text-[13.5px] text-muted">A pessoa passa a entrar com o papel e os grupos escolhidos — dá para mudar depois.</p>
              <div>
                <SelectField id="ap-papel" label="Papel" value={apPapel} onChange={(e) => setApPapel(e.target.value)} disabled={salvandoAp}>
                  {!escolhido && <option value="">Escolha o papel</option>}
                  {papeis.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                      {p.padraoCadastro ? " (padrão dos cadastros)" : ""}
                    </option>
                  ))}
                </SelectField>
                {escolhido && <p className="mt-1 text-[12.5px] text-muted">{descricaoPapel(escolhido)}</p>}
              </div>
              <fieldset>
                <legend className={labelCls}>Grupos</legend>
                <GruposDaPessoa grupos={grupos} selecionados={apGrupos} onChange={setApGrupos} disabled={salvandoAp} />
              </fieldset>
              {apGrupos.length === 0 && escolhido?.chave !== "admin" && (
                <Callout kind="warn" icon={<IconAlert className="h-4 w-4" />}>
                  Sem grupo, a pessoa entra mas não abre nenhuma tela nem vê dados. Dá para incluí-la num grupo depois, em Editar.
                </Callout>
              )}
              {erroAp && (
                <Callout kind="danger" icon={<IconAlert className="h-4 w-4" />}>
                  {erroAp}
                </Callout>
              )}
            </div>
          );
        })()}
      </Modal>
      {/* Ver acesso: o que a pessoa abre e faz, grupo a grupo (só leitura) */}
      <Modal open={!!verAcesso} onClose={() => setVerAcesso(null)} titulo={verAcesso ? `Acesso de ${verAcesso.nome}` : "Acesso"} size="xl">
        {verAcesso && <AcessoDaPessoa admin={papelDe(verAcesso)?.chave === "admin"} papel={papelDe(verAcesso)} grupos={gruposDe(verAcesso)} />}
      </Modal>
      {/* Cargos e funções: a lista que o cadastro oferece (só o ADM) */}
      <Modal open={verCargos} onClose={() => setVerCargos(false)} titulo="Cargos e funções" size="md">
        <CargosAdmin onMudou={carregar} />
      </Modal>
      {confirmacao}
    </div>
  );
}
