"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";
import { DOMINIO_INSTITUCIONAL, emailInstitucional, nomeCompleto } from "@/lib/cadastro-core";
import type { UnidadeTrabalho } from "@/lib/reparticoes";
import { Button } from "./Button";
import { CartaoAuth, ConcluidoAuth, ErroAuth } from "./CartaoAuth";
import { type ConfigCaptcha, EtapaCodigo, useCaptcha, useCodigoEmail } from "./CodigoEmail";
import { OpcoesUnidades } from "./OpcoesUnidades";
import { PasswordField, SelectField, TextField } from "./Field";
import { IconArrowRight, IconIdCard, IconMail, IconUser } from "./icons";

/**
 * CADASTRO em 2 etapas: (1) nome completo, matrícula, unidade, e-mail INSTITUCIONAL e senha (+ captcha) → envia o código;
 * (2) o código de 6 dígitos confirma o e-mail e cria a conta (pendente de aprovação do ADM). `semCodigo` = o PRIMEIRO
 * acesso do sistema (ainda não há envio de e-mails configurado): cria direto.
 */
export function CadastroForm({
  unidades,
  turnstile,
  semCodigo = false,
  erroInicial = null,
}: {
  unidades: UnidadeTrabalho[];
  turnstile?: ConfigCaptcha;
  semCodigo?: boolean;
  erroInicial?: string | null;
}) {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [matricula, setMatricula] = useState("");
  const [unidade, setUnidade] = useState("");
  const [email, setEmail] = useState("");
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
    if (!matricula.trim()) p.matricula = "Informe a matrícula.";
    if (!unidade) p.unidade = "Selecione a unidade em que você trabalha.";
    if (!emailInstitucional(email)) p.email = `Use o seu e-mail institucional (@${DOMINIO_INSTITUCIONAL}).`;
    if (senha.length < 8) p.senha = "A senha deve ter ao menos 8 caracteres.";
    if (confirmar !== senha) p.confirmar = "A confirmação não coincide com a senha.";
    return p;
  }, [nome, matricula, unidade, email, senha, confirmar]);
  const tocar = (campo: string) => () => setTocados((t) => (t.has(campo) ? t : new Set(t).add(campo)));
  const erroDe = (campo: string) => (tocados.has(campo) ? problemas[campo] : undefined);

  async function criarConta() {
    setCriando(true);
    setErro(null);
    try {
      const res = await fetch("/api/auth/cadastro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, matricula, reparticaoId: Number(unidade), email, senha, ...(semCodigo ? {} : { codigo }) }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; pendente?: boolean };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Não foi possível criar a conta.");
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
    const falha = await cod.enviar(email.trim().toLowerCase(), captcha.token);
    if (captcha.usa) captcha.renovar(); // o token do captcha vale uma vez
    setErro(falha);
    if (!falha) setCodigo("");
  }

  async function etapaDados(e: FormEvent) {
    e.preventDefault();
    setTocados(new Set(["nome", "matricula", "unidade", "email", "senha", "confirmar"]));
    if (Object.keys(problemas).length) {
      setErro("Confira os campos destacados.");
      return;
    }
    if (semCodigo) return criarConta();
    if (!captcha.pronto) {
      setErro("Confirme que você não é um robô.");
      return;
    }
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
      <ConcluidoAuth titulo="Conta criada!">
        Seu e-mail foi confirmado e o acesso está <strong className="text-text-2">pendente de aprovação</strong> por um administrador. Você poderá
        entrar assim que for liberado.
      </ConcluidoAuth>
    );

  if (cod.destino)
    return (
      <CartaoAuth titulo="Confirme o seu e-mail" etapa="Etapa 2 de 2" onSubmit={etapaCodigo}>
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
        {erro && <ErroAuth>{erro}</ErroAuth>}
        <Button type="submit" variant="accent" loading={criando} disabled={codigo.length !== 6} className="mt-6 h-[52px] w-full text-[15px]">
          Confirmar e criar conta
        </Button>
      </CartaoAuth>
    );

  return (
    <CartaoAuth titulo="Criar conta" etapa={semCodigo ? undefined : "Etapa 1 de 2"} onSubmit={etapaDados} largo>
      <div className="grid grid-cols-1 gap-[var(--gap-block)] sm:grid-cols-2">
        <div className="sm:col-span-2">
          <TextField
            label="Nome completo"
            icon={<IconUser className="h-5 w-5" />}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onBlur={tocar("nome")}
            error={erroDe("nome")}
            autoComplete="name"
            maxLength={120}
            required
          />
        </div>
        <TextField
          label="Matrícula"
          icon={<IconIdCard className="h-5 w-5" />}
          value={matricula}
          onChange={(e) => setMatricula(e.target.value)}
          onBlur={tocar("matricula")}
          error={erroDe("matricula")}
          inputMode="numeric"
          maxLength={60}
          required
        />
        <SelectField
          label="Unidade em que trabalha"
          value={unidade}
          onChange={(e) => setUnidade(e.target.value)}
          onBlur={tocar("unidade")}
          error={erroDe("unidade")}
          required
        >
          <option value="" disabled>
            Selecione…
          </option>
          <OpcoesUnidades unidades={unidades} />
        </SelectField>
        <div className="sm:col-span-2">
          <TextField
            label="E-mail institucional"
            icon={<IconMail className="h-5 w-5" />}
            type="email"
            inputMode="email"
            placeholder={`nome@${DOMINIO_INSTITUCIONAL}`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={tocar("email")}
            error={erroDe("email")}
            hint={semCodigo ? undefined : "Enviaremos um código de 6 dígitos para confirmar."}
            autoComplete="email"
            maxLength={160}
            required
          />
        </div>
        <PasswordField
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          onBlur={tocar("senha")}
          error={erroDe("senha")}
          hint="Mínimo de 8 caracteres."
          autoComplete="new-password"
          minLength={8}
          required
        />
        <PasswordField
          label="Confirmar senha"
          value={confirmar}
          onChange={(e) => setConfirmar(e.target.value)}
          onBlur={tocar("confirmar")}
          error={erroDe("confirmar")}
          autoComplete="new-password"
          minLength={8}
          required
        />
        {!semCodigo && captcha.widget && <div className="sm:col-span-2">{captcha.widget}</div>}
      </div>

      {erro && <ErroAuth>{erro}</ErroAuth>}

      <Button
        type="submit"
        variant="accent"
        loading={cod.enviando || criando}
        icon={!(cod.enviando || criando) && <IconArrowRight className="h-4 w-4" />}
        className="mt-6 h-[52px] w-full text-[15px]"
      >
        {semCodigo ? "Criar conta" : "Enviar código de confirmação"}
      </Button>

      <div className="mt-5 text-center">
        <Link href="/login" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent hover:underline lg:min-h-0">
          Já tenho conta — entrar
        </Link>
        <p className="mt-2 text-xs text-faint">Depois de aprovado, você pode vincular a sua conta Google no Perfil para entrar com um clique.</p>
      </div>
    </CartaoAuth>
  );
}
