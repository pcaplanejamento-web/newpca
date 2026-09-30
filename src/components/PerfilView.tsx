"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";
import type { UsuarioSessao } from "@/lib/auth";
import { MESA_RESPONSAVEL, type MesaResponsavel, ROTULO_MESA_RESPONSAVEL } from "@/lib/mesa-filtros";
import { APELIDO_MAX, type Pessoa } from "@/lib/pessoa";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { Badge } from "./Badge";
import { Callout } from "./Callout";
import { CampoCongelado } from "./CampoCadeado";
import { type ConfigCaptcha, EtapaCodigo, useCaptcha, useCodigoEmail } from "./CodigoEmail";
import { Checkbox, PasswordField, TextField } from "./Field";
import { labelCls } from "./formStyles";
import {
  IconAlert,
  IconBadgeCheck,
  IconBell,
  IconBriefcase,
  IconBuilding,
  IconCamera,
  IconCheck,
  IconClipboard,
  IconGoogle,
  IconInfo,
  IconKey,
  IconLogout,
  IconMail,
  IconSave,
  IconTrash,
  IconUser,
  IconUserX,
} from "./icons";
import { Switch } from "./Switch";
import { Segmented } from "./Segmented";
import { type ExtraPessoa, SeletorPessoa } from "./SeletorPessoa";
import { redimensionarImagem } from "@/lib/imagem-cliente";
import { CHAVE_PREF_EMAIL, type DestinoEmail, type PrefsEmail, ROTULO_TIPO_EMAIL, TIPOS_EMAIL } from "@/lib/email-core";

const ROLE_LABEL: Record<UsuarioSessao["role"], string> = {
  admin: "Administrador",
  gestor: "Gestor",
  membro: "Membro",
};

type Msg = { tipo: "ok" | "erro"; texto: string } | null;

function Aviso({ msg }: { msg: Msg }) {
  if (!msg) return null;
  const ok = msg.tipo === "ok";
  return (
    <Callout kind={ok ? "ok" : "danger"} icon={ok ? <IconCheck className="h-4 w-4" /> : <IconAlert className="h-4 w-4" />} className="mt-3">
      {msg.texto}
    </Callout>
  );
}

const cardCls = "rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring";

/** Uma SEÇÃO do Perfil: ícone + título + descrição, o conteúdo e (opcional) a ação à direita no rodapé. Um `<form>`
 * quando há `onSubmit`. */
function SecaoPerfil({
  icone,
  titulo,
  descricao,
  onSubmit,
  acao,
  msg,
  children,
}: {
  icone: React.ReactNode;
  titulo: string;
  descricao?: React.ReactNode;
  onSubmit?: (e: FormEvent) => void;
  acao?: React.ReactNode;
  msg?: Msg;
  children: React.ReactNode;
}) {
  const conteudo = (
    <>
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-accent-soft text-accent">{icone}</span>
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold text-text">{titulo}</h3>
          {descricao && <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{descricao}</p>}
        </div>
      </div>
      <div className="mt-4">{children}</div>
      <Aviso msg={msg ?? null} />
      {acao && <div className="mt-4 flex justify-end border-t border-border pt-3">{acao}</div>}
    </>
  );
  return onSubmit ? (
    <form onSubmit={onSubmit} className={cardCls}>
      {conteudo}
    </form>
  ) : (
    <section className={cardCls}>{conteudo}</section>
  );
}
/** Responsável padrão: "" = nenhum (definir na Mesa). */
const EXTRAS_PADRAO: ExtraPessoa[] = [{ valor: "", rotulo: "Nenhum (definir na Mesa)", icone: <IconUserX className="h-4 w-4" /> }];

/** A IDENTIFICAÇÃO institucional (só leitura no Perfil — só o ADM altera) + o que a conta tem. */
export type IdentidadePerfil = {
  unidade: string | null;
  cargo: string | null;
  emailVerificado: boolean;
  /** Sem senha (entrava só pelo Google) — o Perfil pede para CRIAR a senha. */
  semSenha: boolean;
  /** O e-mail da conta Google vinculada (destino opcional dos avisos). */
  googleEmail: string | null;
};

export function PerfilView({
  usuario,
  identidade,
  turnstile,
  protocolacao = null,
  mesaResponsavel = null,
  semModulos = false,
  avisosEmail = null,
  contaGoogle = null,
  retornoGoogle = null,
}: {
  usuario: UsuarioSessao;
  identidade: IdentidadePerfil;
  /** O captcha do ADM — antes de enviar o código da senha. */
  turnstile?: ConfigCaptcha;
  /** Preferência de quem protocola (editores): o RESPONSÁVEL PADRÃO escolhido automaticamente — entre as
   * PESSOAS DO GRUPO ativo (`foraDoGrupo` = o padrão gravado que não é mais do grupo — com a foto, sem re-escolha). */
  protocolacao?: { pessoas: Pessoa[]; responsavelPadraoId: number | null; foraDoGrupo?: Pessoa | null } | null;
  /** Com que RESPONSÁVEL a Mesa abre (só quem vê a Mesa; `null` = sem o card). */
  mesaResponsavel?: MesaResponsavel | null;
  /** O grupo ativo não libera nenhum módulo (Mesa, PCA, Catálogo, Orçamento): avisa o que fazer. */
  semModulos?: boolean;
  /** Os avisos do sino que chegam por E-MAIL (só com o Resend ativo; `null` = sem o card). */
  avisosEmail?: PrefsEmail | null;
  /** A conta Google VINCULADA (só com o login com Google ativo; `null` = sem o card). `soGoogle` = sem senha. */
  contaGoogle?: { email: string | null; soGoogle: boolean } | null;
  /** O retorno do vínculo (`?google=` na volta do Google). */
  retornoGoogle?: { ok: boolean; texto: string } | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  // Dados do perfil: só o apelido e a foto (nome, e-mail, matrícula e unidade = o ADM)
  const [apelido, setApelido] = useState(usuario.apelido ?? "");
  // Foto exibida (a URL da atual ou o data-URL recém-escolhido) — gravada na hora.
  const [foto, setFoto] = useState<string | null>(usuario.foto ?? null);
  const [salvando, setSalvando] = useState(false);
  const [msgPerfil, setMsgPerfil] = useState<Msg>(null);

  // Senha (trocar ou CRIAR): a nova senha vale depois do código enviado ao e-mail (captcha antes de enviar)
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [codigo, setCodigo] = useState("");
  const [semSenha, setSemSenha] = useState(identidade.semSenha);
  const [trocando, setTrocando] = useState(false);
  const [msgSenha, setMsgSenha] = useState<Msg>(null);
  const captcha = useCaptcha(turnstile);
  const cod = useCodigoEmail("senha");

  const [saindo, setSaindo] = useState(false);

  // Protocolação: responsável padrão ao protocolar
  const [respPadrao, setRespPadrao] = useState<number | null>(protocolacao?.responsavelPadraoId ?? null);
  const [salvandoPref, setSalvandoPref] = useState(false);
  const [msgPref, setMsgPref] = useState<Msg>(null);

  // Mesa: com que responsável ela abre (o padrão = só os do próprio usuário)
  const [mesaResp, setMesaResp] = useState<MesaResponsavel>(mesaResponsavel ?? "eu");
  const [salvandoMesa, setSalvandoMesa] = useState(false);
  const [msgMesa, setMsgMesa] = useState<Msg>(null);

  // Conta Google: vincular (vai ao Google e volta aqui) / desvincular
  const [msgGoogle, setMsgGoogle] = useState<Msg>(retornoGoogle ? { tipo: retornoGoogle.ok ? "ok" : "erro", texto: retornoGoogle.texto } : null);
  const [desvinculando, setDesvinculando] = useState(false);
  async function desvincularGoogle() {
    setDesvinculando(true);
    setMsgGoogle(null);
    try {
      const res = await fetch("/api/perfil/google", { method: "DELETE" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Erro ao desvincular.");
      setMsgGoogle({ tipo: "ok", texto: "Conta Google desvinculada." });
      router.refresh();
    } catch (err) {
      setMsgGoogle({ tipo: "erro", texto: err instanceof Error ? err.message : "Erro ao desvincular." });
    } finally {
      setDesvinculando(false);
    }
  }

  // E-mail: quais avisos do sino chegam também por e-mail
  const [emailPrefs, setEmailPrefs] = useState<PrefsEmail | null>(avisosEmail);
  const [salvandoEmail, setSalvandoEmail] = useState(false);
  const [msgEmail, setMsgEmail] = useState<Msg>(null);

  const destinoAtual = emailPrefs?.destino === "google" && identidade.googleEmail ? identidade.googleEmail : usuario.email;

  async function salvarEmail(e: FormEvent) {
    e.preventDefault();
    if (!emailPrefs) return;
    setSalvandoEmail(true);
    setMsgEmail(null);
    try {
      const res = await fetch("/api/preferencias/tabela", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chave: CHAVE_PREF_EMAIL, valor: emailPrefs }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Erro ao salvar.");
      setMsgEmail({ tipo: "ok", texto: "Preferência salva — vale para os próximos avisos." });
    } catch (err) {
      setMsgEmail({ tipo: "erro", texto: err instanceof Error ? err.message : "Erro ao salvar." });
    } finally {
      setSalvandoEmail(false);
    }
  }

  /** Grava UMA preferência (cada card salva a sua) — mesma rota, mesmo tratamento de erro. */
  async function gravarPreferencia(corpo: Record<string, unknown>): Promise<void> {
    const res = await fetch("/api/perfil/preferencias", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !j.ok) throw new Error(j.error ?? "Erro ao salvar.");
  }

  async function salvarPreferencia(e: FormEvent) {
    e.preventDefault();
    setSalvandoPref(true);
    setMsgPref(null);
    try {
      await gravarPreferencia({ responsavelPadraoId: respPadrao });
      setMsgPref({ tipo: "ok", texto: "Preferência salva — vale para os próximos protocolos." });
    } catch (err) {
      setMsgPref({ tipo: "erro", texto: err instanceof Error ? err.message : "Erro ao salvar." });
    } finally {
      setSalvandoPref(false);
    }
  }

  async function salvarMesa(e: FormEvent) {
    e.preventDefault();
    setSalvandoMesa(true);
    setMsgMesa(null);
    try {
      await gravarPreferencia({ mesaResponsavel: mesaResp });
      setMsgMesa({ tipo: "ok", texto: "Preferência salva — vale da próxima vez que a Mesa abrir." });
    } catch (err) {
      setMsgMesa({ tipo: "erro", texto: err instanceof Error ? err.message : "Erro ao salvar." });
    } finally {
      setSalvandoMesa(false);
    }
  }

  /** Grava o apelido e/ou a foto (o que vier) — a foto na hora em que é escolhida ou removida. */
  async function gravarPerfil(corpo: { apelido?: string; foto?: string }, ok: string) {
    setSalvando(true);
    setMsgPerfil(null);
    try {
      const res = await fetch("/api/perfil", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Erro ao salvar.");
      setMsgPerfil({ tipo: "ok", texto: ok });
      router.refresh(); // reflete a foto/apelido no menu
      return true;
    } catch (err) {
      setMsgPerfil({ tipo: "erro", texto: err instanceof Error ? err.message : "Erro ao salvar." });
      return false;
    } finally {
      setSalvando(false);
    }
  }

  async function escolherFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return setMsgPerfil({ tipo: "erro", texto: "Selecione um arquivo de imagem." });
    if (file.size > 8 * 1024 * 1024) return setMsgPerfil({ tipo: "erro", texto: "Imagem muito grande (máx. 8 MB)." });
    try {
      const nova = await redimensionarImagem(file);
      const anterior = foto;
      setFoto(nova);
      if (!(await gravarPerfil({ foto: nova }, "Foto atualizada."))) setFoto(anterior);
    } catch (err) {
      setMsgPerfil({ tipo: "erro", texto: err instanceof Error ? err.message : "Falha na imagem." });
    }
  }

  async function removerFoto() {
    const anterior = foto;
    setFoto(null);
    if (!(await gravarPerfil({ foto: "" }, "Foto removida."))) setFoto(anterior);
  }

  function salvarApelido(e: FormEvent) {
    e.preventDefault();
    void gravarPerfil({ apelido }, "Apelido salvo.");
  }

  async function enviarCodigoSenha() {
    setMsgSenha(null);
    const falha = await cod.enviar(usuario.email, captcha.token);
    if (captcha.usa) captcha.renovar(); // o token do captcha vale uma vez
    if (falha) setMsgSenha({ tipo: "erro", texto: falha });
    else setCodigo("");
  }

  async function trocarSenha(e: FormEvent) {
    e.preventDefault();
    if (!cod.destino) {
      if (novaSenha.length < 8) return setMsgSenha({ tipo: "erro", texto: "A senha deve ter ao menos 8 caracteres." });
      if (novaSenha !== confirmar) return setMsgSenha({ tipo: "erro", texto: "A confirmação não coincide." });
      if (!captcha.pronto) return setMsgSenha({ tipo: "erro", texto: "Confirme que você não é um robô." });
      return enviarCodigoSenha();
    }
    setTrocando(true);
    setMsgSenha(null);
    try {
      const res = await fetch("/api/perfil/senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ novaSenha, codigo }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Erro ao salvar a senha.");
      setMsgSenha({ tipo: "ok", texto: semSenha ? "Senha criada. Agora você também entra com e-mail e senha." : "Senha alterada com sucesso." });
      setSemSenha(false);
      setNovaSenha("");
      setConfirmar("");
      setCodigo("");
      cod.voltar();
      router.refresh();
    } catch (err) {
      setMsgSenha({ tipo: "erro", texto: err instanceof Error ? err.message : "Erro." });
    } finally {
      setTrocando(false);
    }
  }

  async function sair() {
    setSaindo(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignora */
    }
    router.push("/login");
    router.refresh();
  }

  const perfilDados = (
    <SecaoPerfil
      icone={<IconUser className="h-4 w-4" />}
      titulo="Identificação"
      descricao="Nome, e-mail, matrícula, cargo e unidade só podem ser alterados por um administrador."
      onSubmit={salvarApelido}
      msg={msgPerfil}
      acao={
        <Button type="submit" size="sm" loading={salvando} disabled={apelido.trim() === (usuario.apelido ?? "")} icon={<IconSave className="h-4 w-4" />}>
          Salvar apelido
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <TextField
            label="Apelido"
            value={apelido}
            onChange={(e) => setApelido(e.target.value)}
            maxLength={APELIDO_MAX}
            placeholder={`Opcional — ex.: ${usuario.nome.trim().split(/\s+/u)[0] || "Ana"}`}
            autoComplete="nickname"
            hint="Como você aparece no sistema (Responsável, Distribuição, menus). Vazio = o nome."
          />
        </div>
        <CampoCongelado label="Nome completo" valor={usuario.nome} span />
        <div className="sm:col-span-2">
          <span className="mb-1 flex items-center gap-2 text-xs text-muted">
            E-mail institucional
            {identidade.emailVerificado && (
              <Badge tone="emerald">
                <IconBadgeCheck className="h-3 w-3" /> Confirmado
              </Badge>
            )}
          </span>
          <div className="min-h-[40px] break-all rounded-control border border-border bg-surface-2 px-3 py-2 text-sm font-medium leading-snug text-text">
            {usuario.email}
          </div>
        </div>
        <CampoCongelado label="Matrícula" valor={usuario.matricula} />
        <CampoCongelado label="Cargo ou função" valor={identidade.cargo} />
        <CampoCongelado label="Unidade em que trabalha" valor={identidade.unidade} span />
      </div>
    </SecaoPerfil>
  );

  return (
    <div className="space-y-[var(--gap-block)]">
      {semModulos && (
        <Callout kind="info" icon={<IconInfo className="h-4 w-4" />}>
          Nenhum módulo liberado para o seu grupo ativo. Se você tem outro grupo, troque no cabeçalho; senão, peça ao
          administrador para liberar o acesso.
        </Callout>
      )}

      {/* Cabeçalho do perfil: foto (trocar/remover na hora), nome, cargo, unidade, e-mail e papel + Sair */}
      <section className={`${cardCls} flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left`}>
        <div className="relative shrink-0">
          <Avatar nome={usuario.nome} foto={foto} size="xl" />
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={escolherFoto} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={salvando}
            aria-label="Alterar foto"
            title="Alterar foto"
            className="absolute -right-1 -bottom-1 grid h-9 w-9 place-items-center rounded-full border-2 border-surface bg-text text-surface transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
          >
            <IconCamera className="h-4 w-4" />
          </button>
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[20px] font-bold text-text">{usuario.nome}</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            {[usuario.apelido && `“${usuario.apelido}”`, identidade.cargo].filter(Boolean).join(" · ") || "Sem cargo informado"}
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
            <Badge tone="violet">{ROLE_LABEL[usuario.role]}</Badge>
            {identidade.unidade && (
              <Badge tone="slate">
                <IconBuilding className="h-3 w-3" /> {identidade.unidade}
              </Badge>
            )}
          </div>
          {foto && (
            <button
              type="button"
              onClick={removerFoto}
              disabled={salvando}
              className="mt-2 inline-flex min-h-11 items-center gap-1 text-[12px] font-medium text-faint transition hover:text-[var(--danger)] lg:min-h-0"
            >
              <IconTrash className="h-3 w-3" /> Remover foto
            </button>
          )}
        </div>
        <Button variant="secondary" size="sm" onClick={sair} loading={saindo} icon={<IconLogout className="h-4 w-4" />}>
          Sair
        </Button>
      </section>

      <div className="grid items-start gap-[var(--gap-block)] lg:grid-cols-2">
        {/* Coluna da CONTA: identificação, senha e Google */}
        <div className="space-y-[var(--gap-block)]">
          {perfilDados}

          {/* Senha: trocar (ou CRIAR, para quem só entrava pelo Google) — confirmada pelo código enviado ao e-mail */}
          <SecaoPerfil
            icone={<IconKey className="h-4 w-4" />}
            titulo={semSenha ? "Criar senha" : "Senha"}
            descricao={`Para confirmar, enviamos um código de 6 dígitos para ${usuario.email}.`}
            onSubmit={trocarSenha}
            msg={msgSenha}
            acao={
              cod.destino ? (
                <Button type="submit" size="sm" loading={trocando} disabled={codigo.length !== 6} icon={<IconKey className="h-4 w-4" />}>
                  {semSenha ? "Confirmar e criar" : "Confirmar e trocar"}
                </Button>
              ) : (
                <Button type="submit" size="sm" loading={cod.enviando} icon={<IconMail className="h-4 w-4" />}>
                  Enviar código
                </Button>
              )
            }
          >
            {semSenha && (
              <Callout kind="warn" icon={<IconAlert className="h-4 w-4" />} className="mb-3">
                Sua conta ainda não tem senha (você entra só pelo Google). Crie uma — ela é obrigatória.
              </Callout>
            )}
            {cod.destino ? (
              <EtapaCodigo
                destino={cod.destino}
                codigo={codigo}
                onCodigo={setCodigo}
                restante={cod.restante}
                reenviando={cod.enviando}
                onReenviar={enviarCodigoSenha}
                captcha={captcha.widget}
                podeReenviar={captcha.pronto}
                onVoltar={() => {
                  setMsgSenha(null);
                  cod.voltar();
                }}
                disabled={trocando}
              />
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <PasswordField label="Nova senha" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} autoComplete="new-password" minLength={8} hint="Mínimo de 8 caracteres." />
                  <PasswordField label="Confirmar" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} autoComplete="new-password" minLength={8} />
                </div>
                {captcha.widget}
              </div>
            )}
          </SecaoPerfil>

          {/* Conta Google: vinculada = entrar com um clique ("Continuar com Google"), mesmo com outro e-mail */}
          {contaGoogle && (
            <SecaoPerfil
              icone={<IconGoogle className="h-4 w-4" />}
              titulo="Conta Google"
              descricao="Vinculada, você entra com um clique em “Continuar com Google” — mesmo que o e-mail dela seja outro."
              msg={msgGoogle}
              acao={
                contaGoogle.email ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={desvincularGoogle}
                    loading={desvinculando}
                    disabled={contaGoogle.soGoogle}
                    title={contaGoogle.soGoogle ? "Crie uma senha antes: sua conta entra só pelo Google." : undefined}
                  >
                    Desvincular
                  </Button>
                ) : (
                  <Button variant="secondary" size="sm" href="/api/auth/google?vincular=1" icon={<IconGoogle className="h-4 w-4" />}>
                    Vincular conta Google
                  </Button>
                )
              }
            >
              <p className="text-sm text-text-2">
                {contaGoogle.email ? (
                  <>
                    Vinculada a <strong className="break-all text-text">{contaGoogle.email}</strong>.
                  </>
                ) : (
                  "Nenhuma conta vinculada."
                )}
              </p>
            </SecaoPerfil>
          )}
        </div>

        {/* Coluna das PREFERÊNCIAS: e-mail, Mesa e protocolação */}
        <div className="space-y-[var(--gap-block)]">
          {emailPrefs && (
            <SecaoPerfil
              icone={<IconBell className="h-4 w-4" />}
              titulo="Avisos por e-mail"
              descricao="Os avisos continuam no sino; aqui você escolhe quais também chegam por e-mail — e onde."
              onSubmit={salvarEmail}
              msg={msgEmail}
              acao={
                <Button type="submit" size="sm" loading={salvandoEmail} icon={<IconSave className="h-4 w-4" />}>
                  Salvar
                </Button>
              }
            >
              <div className="space-y-4">
                <Switch checked={emailPrefs.ligado} onChange={(ligado) => setEmailPrefs({ ...emailPrefs, ligado })} label={`Receber em ${destinoAtual}`} />
                {/* ONDE chegam: no institucional ou na conta Google vinculada (só com ela vinculada). */}
                {identidade.googleEmail && (
                  <div className={emailPrefs.ligado ? "" : "opacity-60"}>
                    <p className={labelCls}>Receber no</p>
                    <Segmented<DestinoEmail>
                      value={emailPrefs.destino}
                      onChange={(destino) => setEmailPrefs({ ...emailPrefs, destino })}
                      disabled={!emailPrefs.ligado}
                      ariaLabel="Onde receber os avisos por e-mail"
                      options={[
                        { value: "institucional", label: "E-mail institucional", curto: "Institucional" },
                        { value: "google", label: "Conta Google", curto: "Google" },
                      ]}
                    />
                  </div>
                )}
                <fieldset disabled={!emailPrefs.ligado} className={emailPrefs.ligado ? "" : "opacity-60"}>
                  <legend className={labelCls}>Quais avisos</legend>
                  <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
                    {TIPOS_EMAIL.map((t) => (
                      <Checkbox
                        key={t}
                        label={ROTULO_TIPO_EMAIL[t]}
                        checked={emailPrefs.tipos.includes(t)}
                        onChange={(e) =>
                          setEmailPrefs({
                            ...emailPrefs,
                            tipos: e.target.checked ? TIPOS_EMAIL.filter((x) => x === t || emailPrefs.tipos.includes(x)) : emailPrefs.tipos.filter((x) => x !== t),
                          })
                        }
                      />
                    ))}
                  </div>
                </fieldset>
              </div>
            </SecaoPerfil>
          )}

          {/* Mesa: com que RESPONSÁVEL ela abre — só os do usuário (o padrão), geral ou os sem responsável. */}
          {mesaResponsavel != null && (
            <SecaoPerfil
              icone={<IconClipboard className="h-4 w-4" />}
              titulo="Mesa"
              descricao="Com que responsável a Mesa abre — dá para trocar a qualquer momento no filtro da própria Mesa."
              onSubmit={salvarMesa}
              msg={msgMesa}
              acao={
                <Button type="submit" size="sm" loading={salvandoMesa} icon={<IconSave className="h-4 w-4" />}>
                  Salvar
                </Button>
              }
            >
              <Segmented<MesaResponsavel>
                value={mesaResp}
                onChange={setMesaResp}
                ariaLabel="Responsável com que a Mesa abre"
                options={MESA_RESPONSAVEL.map((v) => ({ value: v, label: ROTULO_MESA_RESPONSAVEL[v] }))}
              />
              <p className="mt-2 text-[12px] text-muted">
                {mesaResp === "eu"
                  ? "Só os protocolos em que você é o responsável (e os DFDs e itens deles)."
                  : mesaResp === "todos"
                    ? "Todos os protocolos, de todos os responsáveis."
                    : "Só os protocolos ainda sem responsável — bom para quem distribui."}
              </p>
            </SecaoPerfil>
          )}

          {/* Protocolação (editores): responsável padrão escolhido automaticamente ao protocolar */}
          {protocolacao && (
            <SecaoPerfil
              icone={<IconBriefcase className="h-4 w-4" />}
              titulo="Protocolação"
              descricao="Todo protocolo novo que você protocolar já sai com este responsável (só as pessoas do seu grupo ativo)."
              onSubmit={salvarPreferencia}
              msg={msgPref}
              acao={
                <Button type="submit" size="sm" loading={salvandoPref} icon={<IconSave className="h-4 w-4" />}>
                  Salvar
                </Button>
              }
            >
              {/* FOTO + APELIDO de cada pessoa do grupo; o padrão gravado que saiu do grupo continua visível (só pode ser
                  trocado ou removido). */}
              <SeletorPessoa
                id="p-resp-padrao"
                variante="campo"
                rotulo="Responsável padrão ao protocolar"
                pessoas={protocolacao.pessoas}
                usuarioId={usuario.id}
                valor={respPadrao == null ? "" : String(respPadrao)}
                atual={protocolacao.foraDoGrupo ?? null}
                extras={EXTRAS_PADRAO}
                onChange={(v) => setRespPadrao(v ? Number(v) : null)}
              />
              {respPadrao != null && !protocolacao.pessoas.some((p) => p.id === respPadrao) && (
                <p className="mt-2 text-[12px] text-[var(--warn)]">Esta pessoa não está mais no seu grupo ativo — troque ou remova o padrão.</p>
              )}
            </SecaoPerfil>
          )}
        </div>
      </div>
    </div>
  );
}
