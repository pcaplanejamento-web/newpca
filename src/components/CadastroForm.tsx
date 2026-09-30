"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";
import {
  DOMINIO_INSTITUCIONAL,
  emailDaParteLocal,
  emailInstitucional,
  filtrarNome,
  LIMITES_CADASTRO,
  matriculaValida,
  nomeCompleto,
  nomeValido,
  parteLocalEmail,
  problemaSenha,
  telefoneValido,
} from "@/lib/cadastro-core";
import type { UnidadeTrabalho } from "@/lib/reparticoes";
import { Ajuda } from "./Ajuda";
import { Button } from "./Button";
import { CartaoAuth, ConcluidoAuth, ErroAuth } from "./CartaoAuth";
import { type ConfigCaptcha, EtapaCodigo, useCaptcha, useCodigoEmail } from "./CodigoEmail";
import { OpcoesUnidades, rotuloUnidade } from "./OpcoesUnidades";
import { PasswordField, SelectField, TextField } from "./Field";
import { CampoMatricula } from "./CampoMatricula";
import { CampoTelefone } from "./Telefone";
import { IconArrowRight, IconMail, IconUser } from "./icons";

/**
 * CADASTRO em 2 etapas (um dos modos da `TelaAcesso`): (1) nome completo, matrícula, contato institucional (WhatsApp), cargo/função, unidade, e-mail INSTITUCIONAL e senha (+ captcha) → envia o código;
 * (2) o código de 6 dígitos confirma o e-mail e cria a conta (pendente de aprovação do ADM). `semCodigo` = o PRIMEIRO
 * acesso do sistema (ainda não há envio de e-mails configurado): cria direto.
 */
export function CadastroForm({
  onVoltar,
  unidades,
  cargos,
  turnstile,
  semCodigo = false,
  erroInicial = null,
}: {
  /** Volta para "Entrar" (fim do cadastro). */
  onVoltar: () => void;
  unidades: UnidadeTrabalho[];
  /** Os cargos e funções cadastrados pelo ADM (Usuários → Cargos e funções) — vazio = o campo não aparece. */
  cargos: string[];
  turnstile?: ConfigCaptcha;
  semCodigo?: boolean;
  erroInicial?: string | null;
}) {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [matricula, setMatricula] = useState("");
  // O contato institucional: o número de WhatsApp (só os dígitos).
  const [telefone, setTelefone] = useState("");
  const [cargo, setCargo] = useState("");
  const [unidade, setUnidade] = useState("");
  const unidadeEscolhida = unidades.find((u) => String(u.id) === unidade);
  // Só a parte antes do "@" — o domínio institucional é fixo no campo.
  const [usuarioEmail, setUsuarioEmail] = useState("");
  const email = emailDaParteLocal(usuarioEmail);
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [codigo, setCodigo] = useState("");
  const [tocados, setTocados] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(erroInicial);
  const [criando, setCriando] = useState(false);
  const [pendente, setPendente] = useState(false);
  const captcha = useCaptcha(turnstile);
  const cod = useCodigoEmail("cadastro");

  // Os problemas de cada campo (mostrados depois que o campo é tocado ou ao tentar enviar).
  const problemas = useMemo(() => {
    const p: Record<string, string> = {};
    if (!nomeCompleto(nome)) p.nome = "Informe o nome completo (nome e sobrenome).";
    else if (!nomeValido(nome)) p.nome = "O nome aceita só letras, espaços, apóstrofo e hífen.";
    if (!matricula) p.matricula = "Informe a matrícula.";
    else if (!matriculaValida(matricula)) p.matricula = "A matrícula tem exatamente 6 números.";
    if (!telefone) p.telefone = "Informe o seu WhatsApp com DDD.";
    else if (!telefoneValido(telefone)) p.telefone = "Número com DDD: 11 dígitos no celular.";
    if (cargos.length > 0 && !cargo) p.cargo = "Selecione o seu cargo ou função.";
    if (!unidade) p.unidade = "Selecione a unidade em que você trabalha.";
    if (!emailInstitucional(email)) p.email = "Informe o seu usuário do e-mail institucional (o que vem antes do @).";
    const ps = problemaSenha(senha);
    if (ps) p.senha = ps;
    if (confirmar !== senha) p.confirmar = "A confirmação não coincide com a senha.";
    return p;
  }, [nome, matricula, telefone, cargo, cargos.length, unidade, email, senha, confirmar]);
  const tocar = (campo: string) => () => setTocados((t) => (t.has(campo) ? t : new Set(t).add(campo)));
  const erroDe = (campo: string) => (tocados.has(campo) ? problemas[campo] : undefined);

  async function criarConta() {
    setCriando(true);
    setErro(null);
    try {
      const res = await fetch("/api/auth/cadastro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome,
          matricula,
          telefone,
          // O contato institucional é o WhatsApp.
          telefoneWhatsapp: true,
          cargo,
          reparticaoId: Number(unidade),
          email,
          senha,
          // O 1º acesso (sem código) confere o captcha aqui; os demais já o conferiram ao pedir o código.
          ...(semCodigo ? { token: captcha.token } : { codigo }),
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; pendente?: boolean };
      if (!res.ok || !j.ok) {
        if (semCodigo) captcha.renovar();
        throw new Error(j.error ?? "Não foi possível criar a conta.");
      }
      if (j.pendente) {
        setPendente(true);
        return;
      }
      router.push("/painel");
      router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível criar a conta.");
    } finally {
      setCriando(false);
    }
  }

  async function enviarCodigo() {
    const falha = await cod.enviar(email.trim().toLowerCase(), captcha.token, { matricula });
    captcha.renovar(); // o token do captcha vale uma vez
    setErro(falha);
    if (!falha) setCodigo("");
  }

  async function etapaDados(e: FormEvent) {
    e.preventDefault();
    setTocados(new Set(["nome", "matricula", "telefone", "cargo", "unidade", "email", "senha", "confirmar"]));
    const primeiro = Object.values(problemas)[0];
    if (primeiro) {
      setErro(`Confira os campos destacados — ${primeiro}`);
      return;
    }
    if (!captcha.pronto) {
      setErro("Confirme que você não é um robô.");
      return;
    }
    if (semCodigo) return criarConta();
    await enviarCodigo();
  }

  async function etapaCodigo(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(codigo)) {
      setErro("Informe os 6 dígitos do código.");
      return;
    }
    await criarConta();
  }

  if (pendente)
    return (
      <ConcluidoAuth titulo="Conta criada!" onVoltar={onVoltar}>
        Seu e-mail foi confirmado e o acesso está <strong className="text-text-2">pendente de aprovação</strong> por um administrador. Você poderá
        entrar assim que for liberado.
      </ConcluidoAuth>
    );

  if (cod.destino)
    return (
      <CartaoAuth titulo="Confirme o seu e-mail" etapa="Etapa 2 de 2" subtitulo="Digite o código de 6 dígitos que enviamos." onSubmit={etapaCodigo}>
        <EtapaCodigo
          destino={cod.destino}
          codigo={codigo}
          onCodigo={setCodigo}
          restante={cod.restante}
          reenviando={cod.enviando}
          onReenviar={enviarCodigo}
          captcha={captcha.widget}
          podeReenviar={captcha.pronto}
          onVoltar={() => {
            setErro(null);
            cod.voltar();
          }}
          disabled={criando}
        />
        {erro && <ErroAuth onFechar={() => setErro(null)}>{erro}</ErroAuth>}
        <Button type="submit" variant="accent" loading={criando} disabled={codigo.length !== 6} className="mt-6 h-[52px] w-full text-[15px]">
          Confirmar e criar conta
        </Button>
      </CartaoAuth>
    );

  // Tudo DENSO (caixas de 44px, sem dicas soltas): o cadastro cabe na tela do computador sem rolar.
  return (
    <CartaoAuth
      titulo="Criar conta"
      etapa={semCodigo ? undefined : "Etapa 1 de 2"}
      subtitulo="Use os seus dados funcionais. O acesso é liberado pelo administrador."
      denso
      onSubmit={etapaDados}
    >
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 [@media(max-height:820px)]:gap-2 lg:[@media(max-height:680px)]:gap-1.5">
        <div className="sm:col-span-2">
          <TextField
            label="Nome completo"
            icon={<IconUser className="h-5 w-5" />}
            value={nome}
            onChange={(e) => setNome(filtrarNome(e.target.value))}
            onBlur={tocar("nome")}
            error={erroDe("nome")}
            autoComplete="name"
            maxLength={LIMITES_CADASTRO.nome}
            denso
            required
          />
        </div>
        <CampoMatricula
          label="Matrícula"
          rotuloExtra={
            <Ajuda titulo="A matrícula" rotulo="Ajuda da matrícula" compacta>
              <p>
                É a sua <strong className="text-text">matrícula funcional</strong> na Prefeitura: tem <strong className="text-text">exatamente 6 números</strong> —
                com os zeros à esquerda, se houver (ex.: 012345).
              </p>
              <p>Ela identifica você no sistema e não pode repetir: cada matrícula pertence a uma só conta. Está no contracheque e no crachá.</p>
            </Ajuda>
          }
          valor={matricula}
          onValor={setMatricula}
          onBlur={tocar("matricula")}
          error={erroDe("matricula")}
        />
        <CampoTelefone valor={telefone} onValor={setTelefone} onBlur={tocar("telefone")} error={erroDe("telefone")} />
        {/* Cargo e unidade em linhas INTEIRAS: o nome escolhido cabe sem cortar. */}
        {cargos.length > 0 && (
          <div className="sm:col-span-2">
          <SelectField
            label="Cargo ou função"
            textoEscolhido={cargo || undefined}
            value={cargo}
            onChange={(e) => setCargo(e.target.value)}
            onBlur={tocar("cargo")}
            error={erroDe("cargo")}
            denso
            required
          >
            <option value="" disabled>
              Selecione…
            </option>
            {cargos.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </SelectField>
          </div>
        )}
        <div className="sm:col-span-2">
          <SelectField
            label="Unidade em que trabalha"
            textoEscolhido={unidadeEscolhida ? rotuloUnidade(unidadeEscolhida) : undefined}
            value={unidade}
            onChange={(e) => setUnidade(e.target.value)}
            onBlur={tocar("unidade")}
            error={erroDe("unidade")}
            denso
            required
          >
            <option value="" disabled>
              Selecione…
            </option>
            <OpcoesUnidades unidades={unidades} />
          </SelectField>
        </div>
        <div className="sm:col-span-2">
          <TextField
            label="E-mail institucional"
            icon={<IconMail className="h-5 w-5" />}
            trailing={<span className="shrink-0 select-none text-[13.5px] text-muted sm:text-[15px]">@{DOMINIO_INSTITUCIONAL}</span>}
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="nome.sobrenome"
            value={usuarioEmail}
            onChange={(e) => setUsuarioEmail(parteLocalEmail(e.target.value))}
            onBlur={tocar("email")}
            error={erroDe("email")}
            autoComplete="username"
            maxLength={LIMITES_CADASTRO.usuarioEmail}
            denso
            required
          />
        </div>
        <PasswordField
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          onBlur={tocar("senha")}
          error={erroDe("senha")}
          placeholder="Mínimo 8"
          autoComplete="new-password"
          minLength={LIMITES_CADASTRO.senhaMin}
          maxLength={LIMITES_CADASTRO.senhaMax}
          denso
          required
        />
        <PasswordField
          label="Confirmar senha"
          value={confirmar}
          onChange={(e) => setConfirmar(e.target.value)}
          onBlur={tocar("confirmar")}
          error={erroDe("confirmar")}
          autoComplete="new-password"
          minLength={LIMITES_CADASTRO.senhaMin}
          maxLength={LIMITES_CADASTRO.senhaMax}
          denso
          required
        />
      </div>

      {erro && <ErroAuth onFechar={() => setErro(null)}>{erro}</ErroAuth>}

      {/* O envio e, logo abaixo, o captcha centralizado. */}
      <Button
        type="submit"
        variant="accent"
        loading={cod.enviando || criando}
        icon={!(cod.enviando || criando) && <IconArrowRight className="h-4 w-4" />}
        className="mt-3 h-11 w-full text-[15px] lg:h-11 [@media(max-height:820px)]:mt-2.5 lg:[@media(max-height:680px)]:mt-2"
      >
        {semCodigo ? "Criar conta" : "Enviar código de confirmação"}
      </Button>
      <div className="mt-2.5 flex justify-center lg:[@media(max-height:680px)]:mt-1.5 [&>*]:w-full [&>*]:max-w-[300px]">{captcha.widget}</div>

    </CartaoAuth>
  );
}
