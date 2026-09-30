"use client";

import { useCallback, useEffect, useState } from "react";
import { formatarTelefone } from "@/lib/cadastro-core";
import type { UnidadeTrabalho } from "@/lib/reparticoes";
import { Ajuda, TopicoAjuda } from "./Ajuda";
import { Avatar } from "./Avatar";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { CargosAdmin } from "./CargosAdmin";
import { Callout } from "./Callout";
import { useConfirmacao } from "./Confirmacao";
import { type Column, DataTable } from "./DataTable";
import { IconAlert, IconBriefcase, IconSenhaNova, IconShieldCheck } from "./icons";
import { Modal } from "./Modal";
import { SkeletonLinhas } from "./Skeleton";
import { BotaoWhatsapp } from "./Telefone";
import { toast } from "./Toast";
import { type PatchUsuario, ROLE_LABEL, type Role, STATUS_LABEL, STATUS_TONE, type Status, UsuarioDetalhe, type UsuarioAdmin as U } from "./UsuarioDetalhe";

/** O que cada papel faz — a confirmação da troca e a ajuda da tela dizem o mesmo. */
const ROLE_DESCRICAO: Record<Role, string> = {
  admin: "vê e altera TUDO, inclusive a Administração (usuários, grupos, permissões e configurações)",
  gestor: "opera e configura as telas que o grupo dele libera (importa, edita, exclui)",
  membro: "consulta Mesa, PCA, Catálogo e Orçamento; trabalha em Tarefas e no Calendário",
};

/**
 * USUÁRIOS (ADM): a tabela padrão do sistema — foto + nome, unidade, papel, status, a validação dos dados e o contato
 * pelo WhatsApp. Tocar numa linha abre o BANNER do usuário (`UsuarioDetalhe`) com todos os dados, a edição por cadeado e
 * as ações (validar, exigir nova senha, papel, status, excluir).
 */
export function UsuariosAdmin({ meuId }: { meuId: number }) {
  const [lista, setLista] = useState<U[] | null>(null);
  const [unidades, setUnidades] = useState<UnidadeTrabalho[]>([]);
  const [cargos, setCargos] = useState<string[]>([]);
  const [envioEmail, setEnvioEmail] = useState(false);
  const [verCargos, setVerCargos] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [abertoId, setAbertoId] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState(false);
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
        envioEmail?: boolean;
      };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro ao carregar usuários.");
      setLista(j.usuarios ?? []);
      setUnidades(j.unidades ?? []);
      setCargos((j.cargos ?? []).map((c) => c.nome));
      setEnvioEmail(!!j.envioEmail);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar.");
      setLista((l) => l ?? []);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const aberto = lista?.find((u) => u.id === abertoId) ?? null;

  /** Executa a ação (o banner fica travado enquanto grava) e diz o desfecho num aviso flutuante. */
  async function acao(id: number, init: RequestInit, sucesso: string): Promise<boolean> {
    setOcupado(true);
    try {
      const r = await fetch(`/api/admin/usuarios/${id}`, init);
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Não foi possível concluir — tente de novo.");
      toast.success(sucesso);
      await carregar();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível concluir — tente de novo.");
      return false;
    } finally {
      setOcupado(false);
    }
  }

  const patch = (id: number, dados: PatchUsuario, sucesso: string) =>
    acao(id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dados) }, sucesso);

  /** Trocar o PAPEL confirma antes (é mudança de privilégio): dar ou tirar o Administrador em destaque. */
  async function trocarPapel(u: U, novo: Role) {
    if (novo === u.role) return;
    const ok = await confirmar({
      titulo:
        novo === "admin"
          ? `Tornar ${u.nome} Administrador?`
          : u.role === "admin"
            ? `Retirar o Administrador de ${u.nome}?`
            : `Mudar o papel de ${u.nome} para ${ROLE_LABEL[novo]}?`,
      texto:
        u.role === "admin" && novo !== "admin"
          ? `A pessoa perde a Administração e passa a ${ROLE_LABEL[novo]}: ${ROLE_DESCRICAO[novo]}.`
          : `${ROLE_LABEL[novo]} ${ROLE_DESCRICAO[novo]}.`,
      confirmar: novo === "admin" ? "Tornar Administrador" : `Mudar para ${ROLE_LABEL[novo]}`,
      perigo: novo === "admin" || u.role === "admin",
    });
    if (ok) await patch(u.id, { role: novo }, `${u.nome} agora é ${ROLE_LABEL[novo]}.`);
  }

  async function trocarStatus(u: U, novo: Status) {
    if (novo === "inativo") {
      const ok = await confirmar({
        titulo: `Desativar ${u.nome}?`,
        texto: "A pessoa perde o acesso na hora e não consegue mais entrar. O cadastro e o histórico ficam; dá para reativar depois.",
        confirmar: "Desativar",
        perigo: true,
      });
      if (!ok) return;
    }
    const msg = novo === "inativo" ? `${u.nome} foi desativado(a).` : u.status === "pendente" ? `Acesso de ${u.nome} liberado.` : `${u.nome} foi reativado(a).`;
    await patch(u.id, { status: novo }, msg);
  }

  async function excluir(u: U) {
    const ok = await confirmar({
      titulo: `Excluir ${u.nome}?`,
      texto: "A conta é apagada e a pessoa sai de todos os grupos. O histórico mantém o nome de quem fez cada alteração. Não dá para desfazer — para só tirar o acesso, prefira Desativar.",
      confirmar: "Excluir",
      perigo: true,
    });
    if (ok && (await acao(u.id, { method: "DELETE" }, `${u.nome} foi excluído(a).`))) setAbertoId(null);
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
      minWidth: 220,
      value: (u) => u.nome,
      render: (u) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar nome={u.nome} foto={u.foto} size="sm" />
          <span className="min-w-0 truncate font-medium text-text" title={u.nome}>
            {u.nome}
            {u.id === meuId && <span className="font-normal text-faint"> (você)</span>}
          </span>
        </span>
      ),
    },
    {
      key: "unidade",
      header: "Unidade",
      minWidth: 180,
      value: (u) => u.unidade ?? "—",
      render: (u) => (
        <span className={`block truncate ${u.unidade ? "text-text-2" : "text-faint"}`} title={u.unidade ?? undefined}>
          {u.unidade ?? "—"}
        </span>
      ),
    },
    {
      key: "papel",
      header: "Papel",
      nowrap: true,
      value: (u) => ROLE_LABEL[u.role],
      render: (u) => <span className="text-text-2">{ROLE_LABEL[u.role]}</span>,
    },
    {
      key: "status",
      header: "Status",
      nowrap: true,
      value: (u) => STATUS_LABEL[u.status],
      render: (u) => (
        <span className="inline-flex items-center gap-1.5">
          <Badge tone={STATUS_TONE[u.status]}>{STATUS_LABEL[u.status]}</Badge>
          {u.trocarSenha && (
            <span title="Senha nova exigida" className="inline-flex text-[var(--warn)]">
              <IconSenhaNova className="h-4 w-4" aria-label="Senha nova exigida" />
            </span>
          )}
        </span>
      ),
    },
    {
      key: "dados",
      header: "Dados",
      nowrap: true,
      value: (u) => (u.dadosValidadosEm ? "Validados" : "A validar"),
      render: (u) =>
        u.dadosValidadosEm ? (
          <span className="inline-flex items-center gap-1 text-[12.5px] font-medium text-[var(--ok)]" title={`Validados por ${u.dadosValidadosPor ?? "—"}`}>
            <IconShieldCheck className="h-4 w-4" aria-hidden="true" /> Validados
          </span>
        ) : (
          <span className="text-[12.5px] text-muted">A validar</span>
        ),
    },
    {
      key: "whatsapp",
      header: "WhatsApp",
      nowrap: true,
      value: (u) => (u.telefone ? formatarTelefone(u.telefone) : "—"),
      render: (u) =>
        u.telefone && u.telefoneWhatsapp ? (
          <BotaoWhatsapp telefone={u.telefone} />
        ) : (
          <span className="tabular-nums text-faint" title={u.telefone ? "Sem WhatsApp" : "Sem telefone"}>
            {u.telefone ? formatarTelefone(u.telefone) : "—"}
          </span>
        ),
    },
  ];

  return (
    <div className="space-y-[var(--gap-block)]">
      {pendentes > 0 && (
        <Callout kind="warn" icon={<IconAlert className="h-4 w-4" />}>
          {pendentes} cadastro(s) aguardando sua aprovação — toque na linha para aprovar.
        </Callout>
      )}
      {erro && <Callout kind="danger">{erro}</Callout>}

      <DataTable
        columns={colunas}
        rows={lista}
        getKey={(u) => u.id}
        onRowClick={(u) => setAbertoId(u.id)}
        activeKey={abertoId}
        scrollInterno
        density="compact"
        vazio="Nenhum usuário cadastrado."
        acoesRodape={
          <>
            <Button variant="secondary" size="sm" onClick={() => setVerCargos(true)} icon={<IconBriefcase className="h-4 w-4" />}>
              Cargos e funções
            </Button>
            <Ajuda titulo="Usuários e papéis">
              <p>Toque numa linha para ver TODOS os dados da pessoa: o cadeado libera a edição de cada dado.</p>
              <p>O GRUPO (com a permissão dele) decide QUAIS telas a pessoa abre; o PAPEL decide o que ela faz nelas.</p>
              {(["admin", "gestor", "membro"] as const).map((r) => (
                <TopicoAjuda key={r} titulo={ROLE_LABEL[r]}>
                  {ROLE_DESCRICAO[r][0].toUpperCase() + ROLE_DESCRICAO[r].slice(1)}.
                </TopicoAjuda>
              ))}
              <TopicoAjuda titulo="Validar dados">Confira os dados com a pessoa e valide: fica registrado quem validou e quando. Alterar um dado desfaz a validação.</TopicoAjuda>
              <TopicoAjuda titulo="Exigir nova senha">No próximo acesso, a pessoa cria uma senha nova (confirmada por código no e-mail) antes de usar o sistema.</TopicoAjuda>
              <p>Aprovar libera a entrada; para a pessoa ver dados, ponha-a num grupo em Grupos. Em “Cargos e funções” você cadastra a lista que o cadastro oferece.</p>
            </Ajuda>
          </>
        }
      />

      <UsuarioDetalhe
        usuario={aberto}
        aberto={abertoId != null}
        meuId={meuId}
        unidades={unidades}
        cargos={cargos}
        envioEmail={envioEmail}
        ocupado={ocupado}
        onFechar={() => setAbertoId(null)}
        confirmarDescarte={() =>
          confirmar({ titulo: "Descartar as alterações?", texto: "Os dados alterados neste usuário não foram salvos.", confirmar: "Descartar", perigo: true })
        }
        onSalvar={(p, sucesso) => (aberto ? patch(aberto.id, p, sucesso) : Promise.resolve(false))}
        onPapel={(novo) => aberto && void trocarPapel(aberto, novo)}
        onStatus={(novo) => aberto && void trocarStatus(aberto, novo)}
        onExcluir={() => aberto && void excluir(aberto)}
      />
      {/* Cargos e funções: a lista que o cadastro oferece (só o ADM) */}
      <Modal open={verCargos} onClose={() => setVerCargos(false)} titulo="Cargos e funções" size="md">
        <CargosAdmin onMudou={carregar} />
      </Modal>
      {confirmacao}
    </div>
  );
}
