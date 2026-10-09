"use client";

import { useCallback, useEffect, useState } from "react";
import { formatarTelefone } from "@/lib/cadastro-core";
import type { OpcaoPapel } from "@/lib/papeis";
import type { UnidadeTrabalho } from "@/lib/reparticoes";
import { AcessoDaPessoa } from "./AcessoDaPessoa";
import { Ajuda, TopicoAjuda } from "./Ajuda";
import { Avatar } from "./Avatar";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { CargosAdmin } from "./CargosAdmin";
import { Callout } from "./Callout";
import { CelulaLista } from "./CelulaLista";
import { useConfirmacao } from "./Confirmacao";
import { type Column, DataTable } from "./DataTable";
import { SelectField } from "./Field";
import { labelCls } from "./formStyles";
import { type GrupoOpcao, GruposDaPessoa } from "./GruposDaPessoa";
import { IconAlert, IconArquivar, IconBriefcase, IconCheck, IconSenhaNova, IconShieldCheck } from "./icons";
import { Modal } from "./Modal";
import { SkeletonLinhas } from "./Skeleton";
import { BotaoWhatsapp } from "./Telefone";
import { toast } from "./Toast";
import {
  DESCRICAO_ADMIN,
  descricaoPapel,
  type PatchUsuario,
  STATUS_LABEL,
  STATUS_TONE,
  type Status,
  UsuarioDetalhe,
  type UsuarioAdmin as U,
} from "./UsuarioDetalhe";

/**
 * USUÁRIOS (ADM): a tabela padrão do sistema — foto + nome, unidade, papel, grupos, status, a validação dos dados e o
 * contato pelo WhatsApp. Tocar numa linha abre o BANNER do usuário (`UsuarioDetalhe`) com todos os dados, a edição por
 * cadeado e as ações (validar, exigir nova senha, papel e grupos, aprovar/recusar, status, ver acesso, excluir).
 */
export function UsuariosAdmin({ meuId }: { meuId: number }) {
  const [lista, setLista] = useState<U[] | null>(null);
  const [unidades, setUnidades] = useState<UnidadeTrabalho[]>([]);
  const [cargos, setCargos] = useState<string[]>([]);
  const [papeis, setPapeis] = useState<OpcaoPapel[]>([]);
  const [grupos, setGrupos] = useState<GrupoOpcao[]>([]);
  const [envioEmail, setEnvioEmail] = useState(false);
  const [verCargos, setVerCargos] = useState(false);
  const [verAcesso, setVerAcesso] = useState<U | null>(null);
  const [aprovando, setAprovando] = useState<U | null>(null);
  const [apPapel, setApPapel] = useState("");
  const [apGrupos, setApGrupos] = useState<number[]>([]);
  const [erroAp, setErroAp] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [abertoId, setAbertoId] = useState<number | null>(null);
  // A lista mostra os ATIVOS (e pendentes/inativos) ou só os ARQUIVADOS (restauráveis).
  const [verArquivados, setVerArquivados] = useState(false);
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
        papeis?: OpcaoPapel[];
        grupos?: GrupoOpcao[];
        envioEmail?: boolean;
      };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro ao carregar usuários.");
      setLista(j.usuarios ?? []);
      setUnidades(j.unidades ?? []);
      setCargos((j.cargos ?? []).map((c) => c.nome));
      setPapeis(j.papeis ?? []);
      setGrupos(j.grupos ?? []);
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
  const papelDe = (u: U) => papeis.find((p) => p.id === u.papelId) ?? null;
  const gruposDe = (u: U) => u.grupos.map((id) => grupos.find((g) => g.id === id)).filter((g): g is GrupoOpcao => !!g);

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
    setErroAp(null);
    const ok = await patch(aprovando.id, { status: "ativo", papelId: Number(apPapel), grupos: apGrupos }, `Acesso de ${aprovando.nome} liberado.`);
    if (ok) setAprovando(null);
    else setErroAp("Não foi possível aprovar — confira o aviso e tente de novo.");
  }

  async function recusar(u: U) {
    const ok = await confirmar({
      titulo: `Recusar o cadastro de ${u.nome}?`,
      texto: "O cadastro é apagado e a pessoa não entra. Ela pode se cadastrar de novo, se for o caso.",
      confirmar: "Recusar",
      perigo: true,
    });
    if (ok && (await acao(u.id, { method: "DELETE" }, `Cadastro de ${u.nome} recusado.`))) setAbertoId(null);
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
    await patch(u.id, { status: novo }, novo === "inativo" ? `${u.nome} foi desativado(a).` : `${u.nome} foi reativado(a).`);
  }

  /** "Excluir" ARQUIVA (restaurável); no arquivado, exclui DE VEZ. */
  async function excluir(u: U) {
    const definitivo = !!u.arquivadoEm;
    const ok = await confirmar(
      definitivo
        ? {
            titulo: `Excluir ${u.nome} definitivamente?`,
            texto: "A conta é apagada de vez: grupos, papel e responsabilidades se perdem. O histórico mantém o nome. Não dá para desfazer.",
            confirmar: "Excluir definitivamente",
            perigo: true,
          }
        : {
            titulo: `Arquivar ${u.nome}?`,
            texto: "A pessoa perde o acesso na hora e sai da lista. Tudo fica guardado (grupos, papel, foto, responsabilidades): restaure quando quiser em “Arquivados”.",
            confirmar: "Arquivar",
            perigo: true,
          },
    );
    if (ok && (await acao(u.id, { method: "DELETE" }, definitivo ? `${u.nome} foi excluído(a) definitivamente.` : `${u.nome} foi arquivado(a).`)))
      setAbertoId(null);
  }

  async function restaurar(u: U) {
    if (await patch(u.id, { restaurar: true }, `${u.nome} foi restaurado(a) e já pode entrar.`)) setAbertoId(null);
  }

  if (lista === null) {
    return (
      <div className="rounded-card border border-border p-4">
        <SkeletonLinhas linhas={6} />
      </div>
    );
  }

  const pendentes = lista.filter((u) => u.status === "pendente").length;
  const arquivados = lista.filter((u) => u.arquivadoEm).length;
  const visiveis = lista.filter((u) => !!u.arquivadoEm === verArquivados);

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
      value: (u) => papelDe(u)?.nome ?? "Sem papel",
      render: (u) => {
        const p = papelDe(u);
        return p ? (
          <span className="text-text-2" title={descricaoPapel(p)}>
            {p.nome}
          </span>
        ) : (
          <Badge tone="amber">Sem papel</Badge>
        );
      },
    },
    {
      key: "grupos",
      header: "Grupos",
      minWidth: 160,
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

  const apEscolhido = papeis.find((p) => String(p.id) === apPapel) ?? null;

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
        rows={visiveis}
        getKey={(u) => u.id}
        onRowClick={(u) => setAbertoId(u.id)}
        activeKey={abertoId}
        scrollInterno
        density="compact"
        vazio={verArquivados ? "Nenhum usuário arquivado." : "Nenhum usuário cadastrado."}
        acoesRodape={
          <>
            <Button
              variant={verArquivados ? "accent" : "secondary"}
              size="sm"
              onClick={() => setVerArquivados((v) => !v)}
              icon={<IconArquivar className="h-4 w-4" />}
              aria-pressed={verArquivados}
            >
              {verArquivados ? "Voltar aos usuários" : `Arquivados (${arquivados})`}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setVerCargos(true)} icon={<IconBriefcase className="h-4 w-4" />}>
              Cargos e funções
            </Button>
            <Ajuda titulo="Usuários e papéis">
              <p>Toque numa linha para ver TODOS os dados da pessoa: o cadeado libera a edição de cada dado.</p>
              <p>
                O GRUPO (com a permissão dele) decide QUAIS telas a pessoa abre e as unidades que ela vê; o PAPEL decide o que ela faz
                nelas. Os papéis se criam e se editam em Configurações → Papéis.
              </p>
              {papeis.map((p) => (
                <TopicoAjuda key={p.id} titulo={p.nome}>
                  {p.chave === "admin" ? `O Administrador ${DESCRICAO_ADMIN}.` : `${p.descricao ? `${p.descricao} ` : ""}(${descricaoPapel(p)})`}
                </TopicoAjuda>
              ))}
              <TopicoAjuda titulo="Validar dados">Confira os dados com a pessoa e valide: fica registrado quem validou e quando. Alterar um dado desfaz a validação.</TopicoAjuda>
              <TopicoAjuda titulo="Exigir nova senha">No próximo acesso, a pessoa cria uma senha nova (confirmada por código no e-mail) antes de usar o sistema.</TopicoAjuda>
              <p>Aprovar libera a entrada já com o papel e os grupos (sem grupo, ela entra mas não vê dados). “Ver acesso” mostra o que ela abre e faz em cada grupo.</p>
            </Ajuda>
          </>
        }
      />

      <UsuarioDetalhe
        usuario={aberto}
        aberto={abertoId != null && !aprovando && !verAcesso}
        meuId={meuId}
        unidades={unidades}
        cargos={cargos}
        papeis={papeis}
        grupos={grupos}
        envioEmail={envioEmail}
        ocupado={ocupado}
        onFechar={() => setAbertoId(null)}
        confirmarDescarte={() =>
          confirmar({ titulo: "Descartar as alterações?", texto: "Os dados alterados neste usuário não foram salvos.", confirmar: "Descartar", perigo: true })
        }
        onSalvar={(p, sucesso) => (aberto ? patch(aberto.id, p, sucesso) : Promise.resolve(false))}
        onPapel={(novo) => aberto && void trocarPapel(aberto, novo)}
        onStatus={(novo) => aberto && void trocarStatus(aberto, novo)}
        onAprovar={() => aberto && abrirAprovacao(aberto)}
        onRecusar={() => aberto && void recusar(aberto)}
        onVerAcesso={() => aberto && setVerAcesso(aberto)}
        onExcluir={() => aberto && void excluir(aberto)}
        onRestaurar={() => aberto && void restaurar(aberto)}
      />
      {/* Aprovar: libera a entrada com o papel e os grupos (numa gravação só) */}
      <Modal
        open={!!aprovando}
        onClose={() => setAprovando(null)}
        bloqueado={ocupado}
        titulo={aprovando ? `Aprovar o cadastro de ${aprovando.nome}` : "Aprovar o cadastro"}
        size="md"
        rodape={
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => setAprovando(null)} disabled={ocupado}>
              Cancelar
            </Button>
            <Button size="sm" onClick={() => void aprovar()} loading={ocupado} disabled={!apPapel} icon={<IconCheck className="h-4 w-4" />}>
              Aprovar
            </Button>
          </div>
        }
      >
        <div className="space-y-[var(--gap-block)]">
          <p className="text-[13.5px] text-muted">A pessoa passa a entrar com o papel e os grupos escolhidos — dá para mudar depois.</p>
          <div>
            <SelectField id="ap-papel" label="Papel" value={apPapel} onChange={(e) => setApPapel(e.target.value)} disabled={ocupado}>
              {!apEscolhido && <option value="">Escolha o papel</option>}
              {papeis.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                  {p.padraoCadastro ? " (padrão dos cadastros)" : ""}
                </option>
              ))}
            </SelectField>
            {apEscolhido && <p className="mt-1 text-[12.5px] text-muted">{descricaoPapel(apEscolhido)}</p>}
          </div>
          <fieldset>
            <legend className={labelCls}>Grupos</legend>
            <GruposDaPessoa grupos={grupos} selecionados={apGrupos} onChange={setApGrupos} disabled={ocupado} />
          </fieldset>
          {apGrupos.length === 0 && apEscolhido?.chave !== "admin" && (
            <Callout kind="warn" icon={<IconAlert className="h-4 w-4" />}>
              Sem grupo, a pessoa entra mas não abre nenhuma tela nem vê dados. Dá para incluí-la num grupo depois, no banner do usuário.
            </Callout>
          )}
          {erroAp && (
            <Callout kind="danger" icon={<IconAlert className="h-4 w-4" />}>
              {erroAp}
            </Callout>
          )}
        </div>
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
