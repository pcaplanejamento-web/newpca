"use client";

import { type ReactNode, useMemo, useState } from "react";
import { filtrarNome, filtrarTelefone, formatarTelefone, matriculaValida, nomeValido, telefoneValido } from "@/lib/cadastro-core";
import { dataBR, dataHoraBR } from "@/lib/format";
import type { OpcaoPapel } from "@/lib/papeis";
import { textoResumoCapacidades } from "@/lib/papeis-core";
import { contarRestricoes, textoResumoDetalhes } from "@/lib/papeis-detalhes-core";
import type { UnidadeTrabalho } from "@/lib/reparticoes";
import { Avatar } from "./Avatar";
import { Badge, type Tone } from "./Badge";
import { Button } from "./Button";
import { LinhaCampo, useCadeados } from "./CampoCadeado";
import { CampoMatricula } from "./CampoMatricula";
import { cellCls } from "./formStyles";
import { type GrupoOpcao, GruposDaPessoa } from "./GruposDaPessoa";
import { IconBadgeCheck, IconCheck, IconSave, IconSenhaNova, IconShield, IconShieldCheck, IconTrash, IconUserCheck, IconUserX, IconWhatsapp } from "./icons";
import { Modal } from "./Modal";
import { OpcoesUnidades } from "./OpcoesUnidades";
import { BotaoWhatsapp } from "./Telefone";

export type Status = "ativo" | "pendente" | "inativo";

/** O usuário como a tela do ADM o recebe (`GET /api/admin/usuarios`). */
export type UsuarioAdmin = {
  id: number;
  nome: string;
  apelido: string | null;
  email: string;
  emailVerificado: boolean;
  matricula: string | null;
  cargo: string | null;
  telefone: string | null;
  telefoneWhatsapp: boolean;
  reparticaoId: number | null;
  unidade: string | null;
  foto: string | null;
  /** O papel (Configurações → Papéis); `null` = sem papel (nenhuma tela abre). */
  papelId: number | null;
  /** Os grupos da pessoa (ids). */
  grupos: number[];
  status: Status;
  dadosValidadosEm: string | null;
  dadosValidadosPor: string | null;
  trocarSenha: boolean;
  criadoEm: string | null;
  atualizadoEm: string | null;
};

/** O que a tela manda ao `PATCH /api/admin/usuarios/[id]` — só o que MUDOU. */
export type PatchUsuario = {
  nome?: string;
  email?: string;
  matricula?: string;
  cargo?: string;
  reparticaoId?: number | null;
  telefone?: string;
  telefoneWhatsapp?: boolean;
  papelId?: number;
  grupos?: number[];
  status?: Status;
  validar?: boolean;
  trocarSenha?: boolean;
};

export const STATUS_TONE: Record<Status, Tone> = { ativo: "emerald", pendente: "amber", inativo: "slate" };
export const STATUS_LABEL: Record<Status, string> = { ativo: "Ativo", pendente: "Pendente", inativo: "Inativo" };
/** O que o Administrador faz — a confirmação da troca, a ajuda e o banner dizem o mesmo. */
export const DESCRICAO_ADMIN = "vê e altera TUDO, inclusive a Administração (usuários, grupos, permissões, papéis e configurações)";
/** O que um papel faz, numa linha: o Administrador por extenso; os demais pelas telas e ações (+ as restrições). */
export const descricaoPapel = (p: OpcaoPapel) =>
  p.chave === "admin"
    ? DESCRICAO_ADMIN
    : [textoResumoCapacidades(p.capacidades), contarRestricoes(p.detalhes) ? `restrições: ${textoResumoDetalhes(p.detalhes)}` : ""].filter(Boolean).join(" · ");
export const mesmosIds = (a: readonly number[], b: readonly number[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

type Campo = "nome" | "email" | "matricula" | "telefone" | "cargo" | "unidade" | "grupos";
type Rascunho = { nome: string; email: string; matricula: string; telefone: string; whatsapp: boolean; cargo: string; unidade: string; grupos: number[] };

const doUsuario = (u: UsuarioAdmin): Rascunho => ({
  nome: u.nome,
  email: u.email,
  matricula: u.matricula ?? "",
  telefone: u.telefone ?? "",
  whatsapp: u.telefoneWhatsapp,
  cargo: u.cargo ?? "",
  unidade: u.reparticaoId == null ? "" : String(u.reparticaoId),
  grupos: u.grupos,
});

/** Só o que MUDOU no rascunho (um dado antigo fora do padrão de hoje continua valendo enquanto não for trocado). */
function mudancas(u: UsuarioAdmin, r: Rascunho): PatchUsuario {
  const base = doUsuario(u);
  const p: PatchUsuario = {};
  if (r.nome.trim() !== base.nome) p.nome = r.nome;
  if (r.email.trim().toLowerCase() !== base.email) p.email = r.email;
  if (r.matricula !== base.matricula) p.matricula = r.matricula;
  if (r.telefone !== base.telefone) p.telefone = r.telefone;
  if (r.whatsapp !== base.whatsapp) p.telefoneWhatsapp = r.whatsapp;
  if (r.cargo !== base.cargo) p.cargo = r.cargo;
  if (r.unidade !== base.unidade) p.reparticaoId = r.unidade ? Number(r.unidade) : null;
  // Os grupos vão inteiros, só quando mudaram (a rota troca todos num lote).
  if (!mesmosIds(r.grupos, base.grupos)) p.grupos = r.grupos;
  return p;
}

/** O problema de um campo alterado (ou `undefined`) — a MESMA régua do servidor. */
function problemas(p: PatchUsuario): Partial<Record<Campo, string>> {
  const e: Partial<Record<Campo, string>> = {};
  if (p.nome !== undefined && !nomeValido(p.nome)) e.nome = "Nome e sobrenome, só com letras.";
  if (p.email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email.trim())) e.email = "E-mail inválido.";
  if (p.matricula && !matriculaValida(p.matricula)) e.matricula = "Exatamente 6 números.";
  if (p.telefone && !telefoneValido(p.telefone)) e.telefone = "Com DDD: 10 ou 11 dígitos.";
  return e;
}

/**
 * O BANNER DE UM USUÁRIO (Usuários → tocar na linha): TODOS os dados da pessoa. Cada dado começa só-leitura e o CADEADO
 * libera a edição (`useCadeados`); "Salvar alterações" manda só o que mudou. Ações do ADM com os botões padrão:
 * validar os dados (carimba quem/quando — editar um dado desfaz), exigir que a pessoa crie uma senha nova (a troca é
 * confirmada por código — precisa do envio de e-mails), papel e grupos, aprovar/recusar, desativar/reativar,
 * "Ver acesso" e excluir. As confirmações ficam com quem usa.
 */
export function UsuarioDetalhe({
  usuario: u,
  aberto,
  meuId,
  unidades,
  cargos,
  papeis,
  grupos,
  envioEmail,
  ocupado,
  onFechar,
  confirmarDescarte,
  onSalvar,
  onPapel,
  onStatus,
  onAprovar,
  onRecusar,
  onVerAcesso,
  onExcluir,
}: {
  usuario: UsuarioAdmin | null;
  aberto: boolean;
  meuId: number;
  unidades: UnidadeTrabalho[];
  cargos: string[];
  papeis: OpcaoPapel[];
  grupos: GrupoOpcao[];
  /** O envio de e-mails (Resend) está ativo? Sem ele, "Exigir nova senha" fica travado. */
  envioEmail: boolean;
  /** Gravando (trava os botões e o fechar). */
  ocupado: boolean;
  onFechar: () => void;
  /** Fechar com alterações não salvas pergunta antes (devolve se pode descartar). */
  confirmarDescarte: () => Promise<boolean>;
  /** Grava o patch; `sucesso` = a mensagem. Devolve se deu certo. */
  onSalvar: (patch: PatchUsuario, sucesso: string) => Promise<boolean>;
  onPapel: (novoId: number) => void;
  onStatus: (novo: Status) => void;
  /** Aprovar o cadastro pendente (escolhe o papel e os grupos). */
  onAprovar: () => void;
  onRecusar: () => void;
  onVerAcesso: () => void;
  onExcluir: () => void;
}) {
  const [r, setR] = useState<Rascunho | null>(() => (u ? doUsuario(u) : null));
  const { abertos, alternar, setAbertos } = useCadeados<Campo>();
  // Dados novos do servidor (salvou, outra pessoa alterou, outro usuário aberto) = o rascunho recomeça.
  const chave = u ? `${u.id}:${u.atualizadoEm ?? ""}` : "";
  const [chaveR, setChaveR] = useState(chave);
  if (chave !== chaveR) {
    setChaveR(chave);
    setR(u ? doUsuario(u) : null);
    setAbertos(new Set());
  }
  const patch = useMemo(() => (u && r ? mudancas(u, r) : {}), [u, r]);
  const erros = useMemo(() => problemas(patch), [patch]);
  const sujo = Object.keys(patch).length > 0;
  const invalido = Object.keys(erros).length > 0;

  async function fechar() {
    if (ocupado) return;
    if (sujo && !(await confirmarDescarte())) return;
    setR(u ? doUsuario(u) : null);
    setAbertos(new Set());
    onFechar();
  }

  async function salvar(validar = false) {
    const ok = await onSalvar(
      { ...patch, ...(validar ? { validar: true } : {}) },
      validar ? (sujo ? "Alterações salvas e dados validados." : "Dados validados.") : "Alterações salvas.",
    );
    if (ok) setAbertos(new Set());
  }

  const souEu = u?.id === meuId;
  const papel = u ? (papeis.find((p) => p.id === u.papelId) ?? null) : null;
  return (
    <Modal
      open={aberto && !!u}
      onClose={() => void fechar()}
      titulo={u?.nome ?? "Usuário"}
      size="xl"
      cabecalho={u ? <Cabecalho u={u} souEu={souEu} papel={papel?.nome ?? null} /> : undefined}
      bloqueado={ocupado}
      // Conversar com a pessoa no WhatsApp (o telefone GRAVADO, com WhatsApp) — à esquerda do X.
      acoesCabecalho={u?.telefone && u.telefoneWhatsapp ? <BotaoWhatsapp telefone={u.telefone} size="md" comNumero={false} /> : undefined}
      rodape={
        u && (
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            {/* O pendente é RECUSADO (na seção Acesso); os demais, excluídos. */}
            {!souEu && u.status !== "pendente" ? (
              <Button size="sm" variant="danger" disabled={ocupado} icon={<IconTrash className="h-4 w-4" />} onClick={onExcluir}>
                Excluir
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={ocupado} onClick={() => void fechar()}>
                Fechar
              </Button>
              <Button size="sm" loading={ocupado} disabled={!sujo || invalido} icon={<IconSave className="h-4 w-4" />} onClick={() => void salvar()}>
                Salvar alterações
              </Button>
            </div>
          </div>
        )
      }
    >
      {u && r && (
        <Corpo
          u={u}
          r={r}
          setR={setR}
          abertos={abertos}
          alternar={alternar}
          erros={erros}
          sujo={sujo}
          invalido={invalido}
          souEu={souEu}
          unidades={unidades}
          cargos={cargos}
          papeis={papeis}
          papel={papel}
          grupos={grupos}
          envioEmail={envioEmail}
          ocupado={ocupado}
          onValidar={() => void salvar(true)}
          onSalvar={onSalvar}
          onPapel={onPapel}
          onStatus={onStatus}
          onAprovar={onAprovar}
          onRecusar={onRecusar}
          onVerAcesso={onVerAcesso}
        />
      )}
    </Modal>
  );
}

function Cabecalho({ u, souEu, papel }: { u: UsuarioAdmin; souEu: boolean; papel: string | null }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar nome={u.nome} foto={u.foto} size="lg" />
      <div className="min-w-0">
        <p className="truncate text-[15px] font-semibold text-text">
          {u.nome} {souEu && <span className="font-normal text-faint">(você)</span>}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <Badge tone={STATUS_TONE[u.status]}>{STATUS_LABEL[u.status]}</Badge>
          {papel ? <Badge tone="slate">{papel}</Badge> : <Badge tone="amber">Sem papel</Badge>}
          {u.dadosValidadosEm && <Badge tone="emerald">Dados validados</Badge>}
          {u.trocarSenha && <Badge tone="amber">Senha nova exigida</Badge>}
        </div>
      </div>
    </div>
  );
}

/** Uma seção do banner: título + o conteúdo. */
function Secao({ titulo, acao, children }: { titulo: string; acao?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-card border border-border p-[var(--pad-card)]">
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13.5px] font-semibold text-text">{titulo}</h3>
        {acao}
      </div>
      {children}
    </section>
  );
}

/** O valor só-leitura de um campo com cadeado. */
function Valor({ children }: { children: ReactNode }) {
  return <div className="mt-0.5 min-h-[22px] break-words text-sm font-semibold leading-snug text-text">{children}</div>;
}

/** O erro de um campo destravado (abaixo da caixa). */
function ErroCampo({ texto }: { texto?: string }) {
  return texto ? <p className="mt-1 text-[12px] font-medium text-[var(--sit-devolvido)]">{texto}</p> : null;
}

function Corpo({
  u,
  r,
  setR,
  abertos,
  alternar,
  erros,
  sujo,
  invalido,
  souEu,
  unidades,
  cargos,
  papeis,
  papel,
  grupos,
  envioEmail,
  ocupado,
  onValidar,
  onSalvar,
  onPapel,
  onStatus,
  onAprovar,
  onRecusar,
  onVerAcesso,
}: {
  u: UsuarioAdmin;
  r: Rascunho;
  setR: (f: (x: Rascunho | null) => Rascunho | null) => void;
  abertos: Set<Campo>;
  alternar: (c: Campo) => void;
  erros: Partial<Record<Campo, string>>;
  sujo: boolean;
  invalido: boolean;
  souEu: boolean;
  unidades: UnidadeTrabalho[];
  cargos: string[];
  papeis: OpcaoPapel[];
  papel: OpcaoPapel | null;
  grupos: GrupoOpcao[];
  envioEmail: boolean;
  ocupado: boolean;
  onValidar: () => void;
  onSalvar: (patch: PatchUsuario, sucesso: string) => Promise<boolean>;
  onPapel: (novoId: number) => void;
  onStatus: (novo: Status) => void;
  onAprovar: () => void;
  onRecusar: () => void;
  onVerAcesso: () => void;
}) {
  const set = (k: keyof Rascunho) => (v: string | boolean | number[]) => setR((x) => (x ? { ...x, [k]: v } : x));
  const nomesGrupos = (ids: readonly number[]) => ids.map((id) => grupos.find((g) => g.id === id)?.nome).filter((n): n is string => !!n);
  const lock = (c: Campo) => ({ editavel: true, aberto: abertos.has(c), bloqueado: false, onLock: () => alternar(c) });
  const unidadeNome = u.reparticaoId == null ? null : (unidades.find((x) => x.id === u.reparticaoId)?.nome ?? u.unidade);

  return (
    <div className="space-y-[var(--gap-block)]">
      <Secao titulo="Dados do usuário" acao={<span className="text-[12px] text-muted">Toque no cadeado para editar</span>}>
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
          <LinhaCampo label="Nome completo" span {...lock("nome")}>
            {abertos.has("nome") ? (
              <>
                <input className={cellCls} value={r.nome} onChange={(e) => set("nome")(filtrarNome(e.target.value))} maxLength={120} aria-label="Nome completo" />
                <ErroCampo texto={erros.nome} />
              </>
            ) : (
              <Valor>{r.nome}</Valor>
            )}
          </LinhaCampo>
          <LinhaCampo label="E-mail" {...lock("email")}>
            {abertos.has("email") ? (
              <>
                <input
                  className={cellCls}
                  type="email"
                  value={r.email}
                  onChange={(e) => set("email")(e.target.value.replace(/\s/g, ""))}
                  maxLength={160}
                  aria-label="E-mail"
                />
                <ErroCampo texto={erros.email} />
              </>
            ) : (
              <Valor>
                <span className="inline-flex items-center gap-1 break-all">
                  {r.email}
                  {u.emailVerificado && r.email === u.email && (
                    <IconBadgeCheck className="h-4 w-4 shrink-0 text-[var(--ok)]" aria-label="E-mail confirmado" />
                  )}
                </span>
              </Valor>
            )}
          </LinhaCampo>
          <LinhaCampo label="Matrícula" {...lock("matricula")}>
            {abertos.has("matricula") ? (
              <>
                <CampoMatricula valor={r.matricula} onValor={(v) => set("matricula")(v)} autoFocus />
                <ErroCampo texto={erros.matricula} />
              </>
            ) : (
              <Valor>{r.matricula || "—"}</Valor>
            )}
          </LinhaCampo>
          <LinhaCampo label="Contato institucional" {...lock("telefone")}>
            {abertos.has("telefone") ? (
              <>
                <div className="flex items-center gap-2">
                  <input
                    className={cellCls}
                    value={formatarTelefone(r.telefone)}
                    onChange={(e) => set("telefone")(filtrarTelefone(e.target.value))}
                    inputMode="tel"
                    placeholder="(64) 99999-0000"
                    aria-label="Contato institucional"
                  />
                  <button
                    type="button"
                    onClick={() => set("whatsapp")(!r.whatsapp)}
                    aria-pressed={r.whatsapp}
                    aria-label="Este telefone tem WhatsApp"
                    title={r.whatsapp ? "Tem WhatsApp — tocar desmarca" : "Tocar marca que o telefone tem WhatsApp"}
                    className={`grid h-11 w-11 shrink-0 place-items-center rounded-control border transition-colors lg:h-9 lg:w-9 ${
                      r.whatsapp ? "border-[var(--ok)] text-[var(--ok)]" : "border-border-2 text-faint hover:text-text-2"
                    }`}
                  >
                    <IconWhatsapp className="h-[18px] w-[18px]" />
                  </button>
                </div>
                <ErroCampo texto={erros.telefone} />
              </>
            ) : (
              <Valor>
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  <span className="tabular-nums">{formatarTelefone(r.telefone) || "—"}</span>
                  {r.telefone && r.whatsapp && <Badge tone="emerald">WhatsApp</Badge>}
                </span>
              </Valor>
            )}
          </LinhaCampo>
          <LinhaCampo label="Cargo ou função" {...lock("cargo")}>
            {abertos.has("cargo") ? (
              <select className={cellCls} value={r.cargo} onChange={(e) => set("cargo")(e.target.value)} aria-label="Cargo ou função">
                <option value="">Nenhum</option>
                {/* O cargo atual continua na lista mesmo que tenha saído do cadastro. */}
                {u.cargo && !cargos.includes(u.cargo) && <option value={u.cargo}>{u.cargo} (fora da lista)</option>}
                {cargos.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            ) : (
              <Valor>{r.cargo || "—"}</Valor>
            )}
          </LinhaCampo>
          <LinhaCampo label="Unidade em que trabalha" {...lock("unidade")}>
            {abertos.has("unidade") ? (
              <select className={cellCls} value={r.unidade} onChange={(e) => set("unidade")(e.target.value)} aria-label="Unidade em que trabalha">
                <option value="">Nenhuma</option>
                {/* A unidade atual continua na lista mesmo que hoje esteja oculta. */}
                {u.reparticaoId != null && !unidades.some((x) => x.id === u.reparticaoId) && (
                  <option value={u.reparticaoId}>{u.unidade ?? `Unidade ${u.reparticaoId}`}</option>
                )}
                <OpcoesUnidades unidades={unidades} />
              </select>
            ) : (
              <Valor>{(r.unidade === String(u.reparticaoId ?? "") ? unidadeNome : unidades.find((x) => String(x.id) === r.unidade)?.nome) || "—"}</Valor>
            )}
          </LinhaCampo>
          {/* Só leitura: o apelido é da pessoa (Perfil); a data é do sistema. */}
          <LinhaCampo label="Apelido (a pessoa define no Perfil)" editavel={false} aberto={false} bloqueado={false} onLock={() => {}}>
            <Valor>{u.apelido || "—"}</Valor>
          </LinhaCampo>
          <LinhaCampo label="Cadastrado em" editavel={false} aberto={false} bloqueado={false} onLock={() => {}}>
            <Valor>{u.criadoEm ? dataBR(u.criadoEm) : "—"}</Valor>
          </LinhaCampo>
        </div>
      </Secao>

      <div className="grid gap-[var(--gap-block)] lg:grid-cols-2">
        <Secao titulo="Validação dos dados">
          <p className="text-[13px] leading-relaxed text-text-2">
            {u.dadosValidadosEm ? (
              <>
                <IconShieldCheck className="mr-1 inline h-4 w-4 text-[var(--ok)]" aria-hidden="true" />
                Validados por <strong className="text-text">{u.dadosValidadosPor ?? "—"}</strong> em {dataHoraBR(u.dadosValidadosEm)}. Alterar um dado
                desfaz a validação.
              </>
            ) : (
              "Ainda não validados. Confira os dados acima com a pessoa (ou com o documento) e valide."
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={u.dadosValidadosEm && !sujo ? "secondary" : "accent"}
              disabled={ocupado || invalido}
              icon={<IconShieldCheck className="h-4 w-4" />}
              onClick={onValidar}
            >
              {sujo ? "Salvar e validar" : u.dadosValidadosEm ? "Validar de novo" : "Validar dados"}
            </Button>
            {u.dadosValidadosEm && !sujo && (
              <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => void onSalvar({ validar: false }, "Validação desfeita.")}>
                Desfazer validação
              </Button>
            )}
          </div>
        </Secao>

        <Secao titulo="Senha">
          <p className="text-[13px] leading-relaxed text-text-2">
            {u.trocarSenha
              ? "Exigida: no próximo acesso, a pessoa cria uma senha nova (confirmada por código no e-mail) antes de usar o sistema."
              : "Exija quando houver suspeita de senha exposta ou compartilhada: no próximo acesso, a pessoa cria uma senha nova antes de usar o sistema."}
          </p>
          {!envioEmail && !u.trocarSenha && (
            <p className="text-[12px] text-muted">Requer o envio de e-mails (Integrações → Resend): a senha nova é confirmada por código.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {u.trocarSenha ? (
              <Button size="sm" variant="secondary" disabled={ocupado} onClick={() => void onSalvar({ trocarSenha: false }, "Exigência de senha nova dispensada.")}>
                Dispensar
              </Button>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                disabled={ocupado || souEu || !envioEmail}
                title={souEu ? "A sua senha você troca no Perfil." : undefined}
                icon={<IconSenhaNova className="h-4 w-4" />}
                onClick={() => void onSalvar({ trocarSenha: true }, `${u.nome} vai criar uma senha nova no próximo acesso.`)}
              >
                Exigir nova senha
              </Button>
            )}
          </div>
        </Secao>
      </div>

      <Secao
        titulo="Acesso"
        acao={
          <Button size="sm" variant="secondary" icon={<IconShield className="h-4 w-4" />} onClick={onVerAcesso}>
            Ver acesso
          </Button>
        }
      >
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Papel</span>
            <select
              className={cellCls}
              value={u.papelId == null ? "" : String(u.papelId)}
              disabled={souEu || ocupado || u.status === "pendente"}
              title={souEu ? "Você não altera o próprio papel." : u.status === "pendente" ? "O papel é escolhido ao aprovar." : undefined}
              onChange={(e) => e.target.value && onPapel(Number(e.target.value))}
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
            <span className="mt-1 block text-[12px] leading-snug text-muted">{papel ? descricaoPapel(papel) : "Sem papel: nenhuma tela abre."}</span>
          </label>
          <div>
            <span className="mb-1 block text-xs text-muted">Status</span>
            <div className="flex min-h-11 flex-wrap items-center gap-2 lg:min-h-9">
              <Badge tone={STATUS_TONE[u.status]}>{STATUS_LABEL[u.status]}</Badge>
              {u.status === "pendente" && (
                <>
                  <Button size="sm" disabled={ocupado} icon={<IconCheck className="h-4 w-4" />} onClick={onAprovar}>
                    Aprovar
                  </Button>
                  {!souEu && (
                    <Button size="sm" variant="danger" disabled={ocupado} onClick={onRecusar}>
                      Recusar
                    </Button>
                  )}
                </>
              )}
              {u.status === "ativo" && !souEu && (
                <Button size="sm" variant="secondary" disabled={ocupado} icon={<IconUserX className="h-4 w-4" />} onClick={() => onStatus("inativo")}>
                  Desativar
                </Button>
              )}
              {u.status === "inativo" && (
                <Button size="sm" variant="secondary" disabled={ocupado} icon={<IconUserCheck className="h-4 w-4" />} onClick={() => onStatus("ativo")}>
                  Reativar
                </Button>
              )}
            </div>
          </div>
          <LinhaCampo label="Grupos" span {...lock("grupos")}>
            {abertos.has("grupos") ? (
              <GruposDaPessoa grupos={grupos} selecionados={r.grupos} onChange={(ids) => set("grupos")(ids)} disabled={ocupado} />
            ) : (
              <Valor>{nomesGrupos(r.grupos).join(", ") || "—"}</Valor>
            )}
            {r.grupos.length === 0 && papel?.chave !== "admin" && (
              <p className="mt-1 text-[12.5px] text-[color:var(--warn)]">Sem grupo, a pessoa não abre nenhuma tela nem vê dados.</p>
            )}
          </LinhaCampo>
        </div>
      </Secao>
    </div>
  );
}
