"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";
import type { UsuarioSessao } from "@/lib/auth";
import { APELIDO_MAX, type Pessoa, rotuloOpcaoPessoa } from "@/lib/pessoa";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { PasswordField } from "./Field";
import { inputCls, labelCls } from "./formStyles";
import { IconAlert, IconCamera, IconCheck, IconKey, IconLogout, IconSave, IconTrash, IconUser } from "./icons";
import { ThemeToggle } from "./ThemeToggle";

const ROLE_LABEL: Record<UsuarioSessao["role"], string> = {
  admin: "Administrador",
  gestor: "Gestor",
  membro: "Membro",
};

type Msg = { tipo: "ok" | "erro"; texto: string } | null;

/** Redimensiona a imagem no cliente (máx `max`px) e devolve um data-URL JPEG. */
function redimensionarFoto(file: File, max = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo."));
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = () => reject(new Error("Imagem inválida."));
      img.onload = () => {
        const escala = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * escala));
        const h = Math.max(1, Math.round(img.height * escala));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas indisponível."));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function Aviso({ msg }: { msg: Msg }) {
  if (!msg) return null;
  const ok = msg.tipo === "ok";
  return (
    <Callout kind={ok ? "ok" : "danger"} icon={ok ? <IconCheck className="h-4 w-4" /> : <IconAlert className="h-4 w-4" />} className="mt-3">
      {msg.texto}
    </Callout>
  );
}

const cardCls = "rounded-card border border-border bg-surface p-5 shadow-ring";

export function PerfilView({
  usuario,
  protocolacao = null,
}: {
  usuario: UsuarioSessao;
  /** Preferência de quem protocola (editores): o RESPONSÁVEL PADRÃO escolhido automaticamente — entre as
   * PESSOAS DO GRUPO ativo (`foraDoGrupo` = nome do padrão gravado que não é mais do grupo). */
  protocolacao?: { pessoas: Pessoa[]; responsavelPadraoId: number | null; foraDoGrupo?: string | null } | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  // Dados do perfil
  const [nome, setNome] = useState(usuario.nome);
  const [apelido, setApelido] = useState(usuario.apelido ?? "");
  const [email, setEmail] = useState(usuario.email);
  const [matricula, setMatricula] = useState(usuario.matricula ?? "");
  // Foto exibida (a URL da atual ou o data-URL recém-escolhido) + se MUDOU: só a alteração vai ao servidor.
  const [foto, setFoto] = useState<string | null>(usuario.foto ?? null);
  const [fotoAlterada, setFotoAlterada] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [msgPerfil, setMsgPerfil] = useState<Msg>(null);

  // Trocar senha
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [trocando, setTrocando] = useState(false);
  const [msgSenha, setMsgSenha] = useState<Msg>(null);

  const [saindo, setSaindo] = useState(false);

  // Protocolação: responsável padrão ao protocolar
  const [respPadrao, setRespPadrao] = useState<number | null>(protocolacao?.responsavelPadraoId ?? null);
  const [salvandoPref, setSalvandoPref] = useState(false);
  const [msgPref, setMsgPref] = useState<Msg>(null);

  async function salvarPreferencia(e: FormEvent) {
    e.preventDefault();
    setSalvandoPref(true);
    setMsgPref(null);
    try {
      const res = await fetch("/api/perfil/preferencias", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responsavelPadraoId: respPadrao }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Erro ao salvar.");
      setMsgPref({ tipo: "ok", texto: "Preferência salva — vale para os próximos protocolos." });
    } catch (err) {
      setMsgPref({ tipo: "erro", texto: err instanceof Error ? err.message : "Erro ao salvar." });
    } finally {
      setSalvandoPref(false);
    }
  }

  async function escolherFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMsgPerfil({ tipo: "erro", texto: "Selecione um arquivo de imagem." });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setMsgPerfil({ tipo: "erro", texto: "Imagem muito grande (máx. 8 MB)." });
      return;
    }
    try {
      setFoto(await redimensionarFoto(file));
      setFotoAlterada(true);
      setMsgPerfil(null);
    } catch (err) {
      setMsgPerfil({ tipo: "erro", texto: err instanceof Error ? err.message : "Falha na imagem." });
    }
  }

  async function salvarPerfil(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setMsgPerfil(null);
    try {
      const res = await fetch("/api/perfil", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, apelido, email, matricula, ...(fotoAlterada ? { foto: foto ?? "" } : {}) }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Erro ao salvar.");
      setFotoAlterada(false);
      setMsgPerfil({ tipo: "ok", texto: "Perfil atualizado." });
      router.refresh(); // reflete a foto/nome no menu
    } catch (err) {
      setMsgPerfil({ tipo: "erro", texto: err instanceof Error ? err.message : "Erro ao salvar." });
    } finally {
      setSalvando(false);
    }
  }

  async function trocarSenha(e: FormEvent) {
    e.preventDefault();
    if (novaSenha !== confirmar) {
      setMsgSenha({ tipo: "erro", texto: "A confirmação não coincide." });
      return;
    }
    setTrocando(true);
    setMsgSenha(null);
    try {
      const res = await fetch("/api/perfil/senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senhaAtual, novaSenha }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Erro ao trocar a senha.");
      setMsgSenha({ tipo: "ok", texto: "Senha alterada com sucesso." });
      setSenhaAtual("");
      setNovaSenha("");
      setConfirmar("");
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

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      {/* Dados do perfil */}
      <form onSubmit={salvarPerfil} className={cardCls}>
        <h3 className="text-sm font-bold text-text">Dados do perfil</h3>

        <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          {/* Foto */}
          <div className="flex flex-col items-center gap-2">
            <Avatar nome={nome || usuario.nome} foto={foto} size="xl" />
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={escolherFoto} />
            <Button variant="secondary" onClick={() => fileRef.current?.click()} icon={<IconCamera className="h-4 w-4" />}>
              Alterar foto
            </Button>
            {foto && (
              <button
                type="button"
                onClick={() => {
                  setFoto(null);
                  setFotoAlterada(true);
                }}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-faint transition hover:text-[var(--danger)]"
              >
                <IconTrash className="h-3 w-3" /> Remover
              </button>
            )}
          </div>

          {/* Campos */}
          <div className="w-full flex-1 space-y-3">
            <div>
              <label className={labelCls} htmlFor="p-nome">Nome completo</label>
              <input id="p-nome" className={inputCls} value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" required />
            </div>
            <div>
              <label className={labelCls} htmlFor="p-apelido">Apelido</label>
              <input
                id="p-apelido"
                className={inputCls}
                value={apelido}
                onChange={(e) => setApelido(e.target.value)}
                maxLength={APELIDO_MAX}
                placeholder={`Opcional — ex.: ${nome.trim().split(/\s+/u)[0] || "Ana"}`}
                autoComplete="nickname"
              />
              <p className="mt-1 text-[11px] text-faint">Como você aparece no sistema (Responsável, Distribuição, menus). Vazio = o nome.</p>
            </div>
            <div>
              <label className={labelCls} htmlFor="p-email">E-mail</label>
              <input id="p-email" type="email" inputMode="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            </div>
            <div>
              <label className={labelCls} htmlFor="p-matricula">Matrícula</label>
              <input id="p-matricula" className={inputCls} value={matricula} onChange={(e) => setMatricula(e.target.value)} placeholder="Opcional" />
            </div>
            <div className="text-xs text-faint">
              Papel: <span className="font-semibold text-text-2">{ROLE_LABEL[usuario.role]}</span>
            </div>
          </div>
        </div>

        <Aviso msg={msgPerfil} />

        <div className="mt-4 flex justify-end">
          <Button type="submit" loading={salvando} icon={<IconSave className="h-[18px] w-[18px]" />}>
            Salvar
          </Button>
        </div>
      </form>

      {/* Trocar senha */}
      <form onSubmit={trocarSenha} className={cardCls}>
        <h3 className="flex items-center gap-2 text-sm font-bold text-text">
          <IconKey className="h-4 w-4" /> Trocar senha
        </h3>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <PasswordField label="Senha atual" value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} autoComplete="current-password" required />
          <PasswordField label="Nova senha" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} autoComplete="new-password" minLength={8} required />
          <PasswordField label="Confirmar" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} autoComplete="new-password" minLength={8} required />
        </div>
        <Aviso msg={msgSenha} />
        <div className="mt-4 flex justify-end">
          <Button type="submit" loading={trocando} icon={<IconKey className="h-[18px] w-[18px]" />}>
            Trocar senha
          </Button>
        </div>
      </form>

      {/* Protocolação (editores): responsável padrão escolhido automaticamente ao protocolar */}
      {protocolacao && (
        <form onSubmit={salvarPreferencia} className={`lg:col-span-2 ${cardCls}`}>
          <h3 className="flex items-center gap-2 text-sm font-bold text-text">
            <IconUser className="h-4 w-4" /> Protocolação
          </h3>
          <div className="mt-4 max-w-xl">
            <label className={labelCls} htmlFor="p-resp-padrao">
              Responsável padrão ao protocolar
            </label>
            <select
              id="p-resp-padrao"
              className={inputCls}
              value={respPadrao ?? ""}
              onChange={(e) => setRespPadrao(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">— Nenhum (definir na Mesa) —</option>
              {/* O padrão gravado que deixou de ser do grupo continua visível (só pode ser trocado/removido). */}
              {respPadrao != null && !protocolacao.pessoas.some((p) => p.id === respPadrao) && (
                <option value={respPadrao} disabled>
                  {protocolacao.foraDoGrupo ?? `#${respPadrao}`} (fora do grupo)
                </option>
              )}
              {protocolacao.pessoas.map((p) => (
                <option key={p.id} value={p.id}>
                  {rotuloOpcaoPessoa(p, usuario.id)}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-[12px] text-muted">
              Todo protocolo novo que você protocolar já sai com este responsável — dá para trocar depois na coluna Responsável
              da Mesa. Só as pessoas do seu grupo ativo podem ser escolhidas.
            </p>
          </div>
          <Aviso msg={msgPref} />
          <div className="mt-4 flex justify-end">
            <Button type="submit" loading={salvandoPref} icon={<IconSave className="h-[18px] w-[18px]" />}>
              Salvar preferência
            </Button>
          </div>
        </form>
      )}

      {/* Aparência */}
      <div className={`flex items-center justify-between lg:col-span-2 ${cardCls}`}>
        <div>
          <div className="text-sm font-semibold text-text-2">Aparência</div>
          <div className="text-xs text-muted">Alternar tema claro / escuro</div>
        </div>
        <ThemeToggle />
      </div>

      {/* Sair */}
      <Button
        variant="secondary"
        onClick={sair}
        loading={saindo}
        icon={<IconLogout className="h-4 w-4" />}
        style={{ color: "var(--danger)" }}
        className="w-full lg:col-span-2"
      >
        Sair da conta
      </Button>
    </div>
  );
}
