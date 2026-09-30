"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PapelCadastro } from "@/lib/papeis";
import { type Capacidades, diffCapacidades, MAX_DESCRICAO_PAPEL, MAX_NOME_PAPEL, MODELOS_PAPEL, retiraAlgo, textoDiffCapacidades } from "@/lib/papeis-core";
import { compactarDetalhes, contarRestricoes, type DetalhesPapel, detalhesPadrao, diffDetalhes, restringeAlgo, textoDiffDetalhes } from "@/lib/papeis-detalhes-core";
import { Ajuda, TopicoAjuda } from "./Ajuda";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { useConfirmacao } from "./Confirmacao";
import { type Column, DataTable } from "./DataTable";
import { DetalhesPapelEditor } from "./DetalhesPapelEditor";
import { ErroCarga } from "./ErroCarga";
import { SelectField, TextArea, TextField } from "./Field";
import { IconCopy, IconLock, IconPencil, IconPlus, IconSave, IconTrash } from "./icons";
import { MatrizCapacidades } from "./MatrizCapacidades";
import { Modal } from "./Modal";
import { ResumoDetalhesPapel } from "./ResumoDetalhesPapel";
import { ResumoPapel } from "./ResumoPapel";
import { Segmented } from "./Segmented";
import { SkeletonLinhas } from "./Skeleton";
import { Switch } from "./Switch";
import { toast } from "./Toast";

type Rascunho = { id: number | null; nome: string; descricao: string; capacidades: Capacidades; detalhes: DetalhesPapel; padraoCadastro: boolean };
type AbaEditor = "telas" | "detalhes";

async function chamar(url: string, init?: RequestInit): Promise<{ papeis?: PapelCadastro[]; id?: number }> {
  const r = await fetch(url, init).catch(() => null);
  const j = (await r?.json().catch(() => null)) as { ok?: boolean; error?: string; papeis?: PapelCadastro[]; id?: number } | null;
  if (!r?.ok || !j?.ok) throw new Error(j?.error ?? "Não foi possível concluir. Tente de novo.");
  return j;
}

/** Por que o papel não se exclui (o botão fica desabilitado com a dica) — `null` = pode. */
function motivoNaoExcluir(p: PapelCadastro): string | null {
  if (p.chave) return "Papel do sistema: não se exclui (pode ser editado).";
  if (p.padraoCadastro) return "É o padrão dos novos cadastros: marque outro papel como padrão antes.";
  if (p.pessoas > 0) return `${p.pessoas} ${p.pessoas === 1 ? "pessoa tem" : "pessoas têm"} este papel: troque o papel delas em Usuários antes.`;
  return null;
}

/**
 * PAPÉIS (Configurações → Papéis, só o ADM): o GRUPO decide QUAIS telas a pessoa abre; o PAPEL decide o que ela faz em
 * cada uma — Visualizar · Manipular · Importar · Exportar · Excluir · Configurar — e os DETALHES dentro delas (Responsável,
 * Distribuição, linhas da Mesa, desempenho por pessoa). Lista (nome + selos, o resumo das telas, as restrições, quantas
 * pessoas) e o editor num banner: nome, descrição, "Padrão para novos cadastros" e, em duas abas, "Começar de" (modelos) +
 * a MATRIZ Telas × Ações | os DETALHES. O Administrador é fixo (só consulta); Gestor e Membro se editam, não se excluem;
 * alterar um papel em uso que RETIRA acesso pede confirmação (vale na hora para as pessoas dele).
 */
export function PapeisAdmin() {
  const [lista, setLista] = useState<PapelCadastro[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [consulta, setConsulta] = useState<PapelCadastro | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [aba, setAba] = useState<AbaEditor>("telas");
  const { confirmar, confirmacao } = useConfirmacao();

  const carregar = useCallback(async () => {
    try {
      const j = await chamar("/api/admin/papeis");
      setLista(j.papeis ?? []);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar os papéis.");
      setLista((l) => l ?? []);
    }
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const atual = rascunho?.id != null ? (lista?.find((p) => p.id === rascunho.id) ?? null) : null;
  const diff = useMemo(() => (rascunho && atual ? diffCapacidades(atual.capacidades, rascunho.capacidades) : []), [rascunho, atual]);
  const diffDet = useMemo(() => (rascunho && atual ? diffDetalhes(atual.detalhes, rascunho.detalhes) : []), [rascunho, atual]);
  const restringe = retiraAlgo(diff) || restringeAlgo(diffDet);
  const nomeOk = !!rascunho && rascunho.nome.trim().length >= 2 && rascunho.nome.trim().length <= MAX_NOME_PAPEL;
  const alterado =
    !!rascunho &&
    (!atual ||
      rascunho.nome.trim() !== atual.nome ||
      rascunho.descricao.trim() !== (atual.descricao ?? "") ||
      diff.length > 0 ||
      diffDet.length > 0 ||
      rascunho.padraoCadastro !== atual.padraoCadastro);

  const abrir = (r: Rascunho) => {
    setAba("telas");
    setRascunho(r);
  };
  const novo = () => abrir({ id: null, nome: "", descricao: "", capacidades: MODELOS_PAPEL[0].capacidades, detalhes: detalhesPadrao(), padraoCadastro: false });
  const editar = (p: PapelCadastro) =>
    p.chave === "admin"
      ? setConsulta(p)
      : abrir({ id: p.id, nome: p.nome, descricao: p.descricao ?? "", capacidades: p.capacidades, detalhes: p.detalhes, padraoCadastro: p.padraoCadastro });
  // O Administrador não tem detalhes (ignora): a cópia dele começa sem restrições.
  const duplicar = (p: PapelCadastro) =>
    abrir({
      id: null,
      nome: `Cópia de ${p.nome}`.slice(0, MAX_NOME_PAPEL),
      descricao: p.descricao ?? "",
      capacidades: p.capacidades,
      detalhes: p.chave === "admin" ? detalhesPadrao() : p.detalhes,
      padraoCadastro: false,
    });

  const fechar = async () => {
    if (salvando) return;
    if (alterado && !(await confirmar({ titulo: "Descartar as alterações do papel?", confirmar: "Descartar", perigo: true }))) return;
    setRascunho(null);
  };

  async function salvar() {
    if (!rascunho || !nomeOk || salvando) return;
    const r = rascunho;
    // Retirar acesso de um papel EM USO (capacidades ou detalhes) vale na hora para as pessoas dele: confirma dizendo o
    // quê e quantas.
    if (atual && atual.pessoas > 0 && restringe) {
      const perdas = [
        textoDiffCapacidades(diff.filter((d) => d.perdeu.length)),
        textoDiffDetalhes(diffDet.filter((d) => d.restringe)),
      ].filter(Boolean);
      const ok = await confirmar({
        titulo: `Retirar acesso de "${atual.nome}"?`,
        texto: `${atual.pessoas} ${atual.pessoas === 1 ? "pessoa perde" : "pessoas perdem"} na hora: ${perdas.join(" · ")}.`,
        confirmar: "Salvar assim",
        perigo: true,
      });
      if (!ok) return;
    }
    setSalvando(true);
    try {
      const corpo = {
        nome: r.nome.trim(),
        descricao: r.descricao.trim() || null,
        capacidades: r.capacidades,
        detalhes: compactarDetalhes(r.detalhes),
        ...(r.padraoCadastro && !atual?.padraoCadastro ? { padraoCadastro: true } : {}),
      };
      if (r.id == null) await chamar("/api/admin/papeis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
      else await chamar(`/api/admin/papeis/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
      toast.success(r.id == null ? `Papel "${corpo.nome}" criado.` : `Papel "${corpo.nome}" salvo.`);
      setRascunho(null);
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar o papel.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(p: PapelCadastro) {
    if (!(await confirmar({ titulo: `Excluir o papel "${p.nome}"?`, texto: "Ninguém tem este papel; ele sai da lista.", confirmar: "Excluir", perigo: true }))) return;
    try {
      await chamar(`/api/admin/papeis/${p.id}`, { method: "DELETE" });
      toast.success(`Papel "${p.nome}" excluído.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir o papel.");
    }
    await carregar();
  }

  if (lista === null) return <SkeletonLinhas linhas={4} />;

  const cols: Column<PapelCadastro>[] = [
    {
      key: "nome",
      header: "Papel",
      align: "left",
      minWidth: 160,
      value: (p) => p.nome,
      render: (p) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-text">{p.nome}</span>
          {p.chave === "admin" ? (
            <Badge tone="slate">
              <IconLock className="mr-1 inline h-3 w-3" aria-hidden />
              Fixo
            </Badge>
          ) : p.chave ? (
            <Badge tone="slate">Sistema</Badge>
          ) : null}
          {p.padraoCadastro && <Badge tone="blue">Padrão dos cadastros</Badge>}
        </div>
      ),
    },
    {
      key: "telas",
      header: "Telas e ações",
      align: "left",
      filter: "none",
      minWidth: 220,
      render: (p) => (p.chave === "admin" ? <span className="text-[13px] text-text-2">Tudo, inclusive a Administração</span> : <ResumoPapel capacidades={p.capacidades} compacto />),
    },
    {
      key: "detalhes",
      header: "Detalhes",
      nowrap: true,
      // O filtro por "Sem restrições" / "N restrições" (a quantidade).
      value: (p) => (p.chave === "admin" ? "Sem restrições" : contarRestricoes(p.detalhes) ? `${contarRestricoes(p.detalhes)} restrições` : "Sem restrições"),
      render: (p) => (p.chave === "admin" ? <span className="text-[12.5px] text-faint">—</span> : <ResumoDetalhesPapel detalhes={p.detalhes} compacto />),
    },
    {
      key: "pessoas",
      header: "Pessoas",
      nowrap: true,
      filter: "range",
      numero: (p) => p.pessoas,
      formatarFaixa: (n) => String(Math.round(n)),
      value: (p) => String(p.pessoas),
      render: (p) => (
        <span className="tabular-nums" title={`${p.ativas} ativa(s) de ${p.pessoas}`}>
          {p.pessoas}
        </span>
      ),
    },
    {
      key: "acoes",
      header: "",
      filter: "none",
      align: "right",
      nowrap: true,
      render: (p) => {
        const motivo = motivoNaoExcluir(p);
        return (
          <div className="flex items-center justify-end gap-1">
            <Button
              size="xs"
              variant="icon"
              aria-label={p.chave === "admin" ? `Ver o papel ${p.nome}` : `Editar o papel ${p.nome}`}
              title={p.chave === "admin" ? "Ver (fixo)" : "Editar"}
              icon={<IconPencil className="h-4 w-4" />}
              onClick={() => editar(p)}
            />
            <Button size="xs" variant="icon" aria-label={`Duplicar o papel ${p.nome}`} title="Duplicar" icon={<IconCopy className="h-4 w-4" />} onClick={() => duplicar(p)} />
            <Button
              size="xs"
              variant="icon"
              aria-label={`Excluir o papel ${p.nome}`}
              title={motivo ?? "Excluir"}
              icon={<IconTrash className="h-4 w-4" style={motivo ? undefined : { color: "var(--danger)" }} />}
              onClick={() => excluir(p)}
              disabled={!!motivo}
            />
          </div>
        );
      },
    },
  ];

  const ehPadraoGravado = !!atual?.padraoCadastro;
  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13.5px] text-muted">O grupo decide quais telas a pessoa abre; o papel decide o que ela faz em cada uma.</p>
        <div className="flex items-center gap-1">
          <Button size="sm" icon={<IconPlus className="h-4 w-4" />} onClick={novo}>
            Novo papel
          </Button>
          <Ajuda titulo="Papéis">
            <TopicoAjuda titulo="Grupo × papel">
              A permissão do GRUPO libera as telas; o PAPEL da pessoa diz o que ela faz em cada uma. Sem Visualizar, a tela fica
              fechada mesmo que o grupo a libere.
            </TopicoAjuda>
            <TopicoAjuda titulo="As ações">
              Visualizar (abrir e consultar) · Manipular (criar e editar) · Importar (trazer arquivos) · Exportar (baixar) ·
              Excluir (apagar registros) · Configurar (a configuração da tela e o que vale para todos). Toque numa célula para ver
              o que ela cobre naquela tela.
            </TopicoAjuda>
            <TopicoAjuda titulo="Detalhes">
              Dentro das telas que o papel abre, os DETALHES só RETIRAM: ver ou não o Responsável e a Distribuição, alterar o
              Responsável (não altera · só assume para si · qualquer pessoa do grupo), ver só os próprios protocolos e o
              desempenho por pessoa do Dashboard. O que fica oculto não sai do servidor.
            </TopicoAjuda>
            <TopicoAjuda titulo="Administrador">
              Fixo: tem tudo, inclusive a Administração (usuários, grupos, permissões, papéis e configurações).
            </TopicoAjuda>
            <TopicoAjuda titulo="Padrão dos cadastros">
              O papel que a pessoa recebe ao se cadastrar (e ao ser aprovada). Há sempre um; trocar = marcar outro.
            </TopicoAjuda>
            <TopicoAjuda titulo="Vale na hora">
              Alterar um papel muda o acesso de todas as pessoas dele na próxima ação delas.
            </TopicoAjuda>
          </Ajuda>
        </div>
      </div>
      {erro && <ErroCarga msg={erro} onTentar={() => void carregar()} kind={lista.length ? "warn" : "danger"} />}
      <DataTable columns={cols} rows={lista} getKey={(p) => p.id} density="compact" onRowClick={editar} vazio="Nenhum papel cadastrado." />

      {rascunho && (
        <Modal
          open
          onClose={() => void fechar()}
          bloqueado={salvando}
          titulo={rascunho.id == null ? "Novo papel" : `Papel "${atual?.nome ?? rascunho.nome}"`}
          size="xl"
          rodape={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => void fechar()} disabled={salvando}>
                Cancelar
              </Button>
              <Button icon={<IconSave className="h-4 w-4" />} onClick={() => void salvar()} loading={salvando} disabled={!nomeOk || !alterado}>
                Salvar
              </Button>
            </div>
          }
        >
          <div className="space-y-[var(--gap-block)]">
            <div className="grid gap-[var(--gap-block)] md:grid-cols-2">
              <TextField
                label="Nome do papel"
                value={rascunho.nome}
                maxLength={MAX_NOME_PAPEL}
                onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
                placeholder="Ex.: Consulta da Mesa"
              />
              <SelectField
                label="Começar de"
                value=""
                onChange={(e) => {
                  const m = MODELOS_PAPEL.find((x) => x.id === e.target.value);
                  if (m) setRascunho({ ...rascunho, capacidades: m.capacidades });
                }}
              >
                <option value="">Escolha um modelo…</option>
                {MODELOS_PAPEL.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </SelectField>
            </div>
            <TextArea
              label="Descrição (opcional)"
              rows={2}
              value={rascunho.descricao}
              maxLength={MAX_DESCRICAO_PAPEL}
              onChange={(e) => setRascunho({ ...rascunho, descricao: e.target.value })}
              placeholder="Para quem é este papel"
            />
            <div>
              <Switch
                checked={rascunho.padraoCadastro}
                disabled={ehPadraoGravado}
                onChange={(v) => setRascunho({ ...rascunho, padraoCadastro: v })}
                label="Padrão para novos cadastros"
              />
              <p className="text-[12.5px] text-muted">
                {ehPadraoGravado
                  ? "É o padrão atual: para trocar, marque outro papel como padrão."
                  : rascunho.padraoCadastro
                    ? "Quem se cadastrar recebe este papel; o padrão anterior deixa de ser."
                    : "Quem se cadastrar recebe o papel padrão."}
              </p>
            </div>
            <Segmented<AbaEditor>
              value={aba}
              onChange={setAba}
              ariaLabel="Parte do papel"
              options={[
                { value: "telas", label: "Telas e ações", curto: "Telas" },
                {
                  value: "detalhes",
                  label: `Detalhes${contarRestricoes(rascunho.detalhes) ? ` (${contarRestricoes(rascunho.detalhes)})` : ""}`,
                },
              ]}
            />
            <div key={aba} className="animate-fade-in-up">
              {aba === "telas" ? (
                <MatrizCapacidades valor={rascunho.capacidades} original={atual?.capacidades} onChange={(c) => setRascunho({ ...rascunho, capacidades: c })} />
              ) : (
                <DetalhesPapelEditor valor={rascunho.detalhes} original={atual?.detalhes} onChange={(d) => setRascunho({ ...rascunho, detalhes: d })} />
              )}
            </div>
            {atual && atual.pessoas > 0 && (diff.length > 0 || diffDet.length > 0) && (
              <Callout kind={restringe ? "warn" : "info"}>
                {atual.pessoas} {atual.pessoas === 1 ? "pessoa tem" : "pessoas têm"} este papel e {atual.pessoas === 1 ? "sente" : "sentem"} a mudança
                na hora: {[textoDiffCapacidades(diff), textoDiffDetalhes(diffDet)].filter(Boolean).join(" · ")}.
              </Callout>
            )}
          </div>
        </Modal>
      )}

      {consulta && (
        <Modal open onClose={() => setConsulta(null)} titulo={`Papel "${consulta.nome}"`} size="xl">
          <div className="space-y-[var(--gap-block)]">
            <Callout kind="info" icon={<IconLock className="h-4 w-4" />}>
              Papel fixo do sistema: tem tudo, em todas as telas, inclusive a Administração — não se altera nem se exclui.
            </Callout>
            <MatrizCapacidades valor={consulta.capacidades} />
          </div>
        </Modal>
      )}
      {confirmacao}
    </div>
  );
}
