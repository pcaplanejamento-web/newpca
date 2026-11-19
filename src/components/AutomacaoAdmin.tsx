"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CONFIG_CENTI_PADRAO,
  type ConfigCenti,
  lerConfigCenti,
  maiorVersao,
  type ProtocoloAutomacao,
  ajusteDaOperacao,
  VERSAO_EXTENSAO_CENTI,
  versaoAtende,
  versaoFunciona,
} from "@/lib/automacao-centi-core";
import { haQuanto } from "@/lib/acessos-core";
import { dataHoraBR } from "@/lib/format";
import { Ajuda } from "./Ajuda";
import { Badge } from "./Badge";
import { Callout } from "./Callout";
import { type AberturaMesa, BannersMesa } from "./BannersMesa";
import { Button } from "./Button";
import { useConfirmacao } from "./Confirmacao";
import { Dropdown } from "./Dropdown";
import { PasswordField, TextField } from "./Field";
import { cellCls } from "./formStyles";
import { BotaoAtualizar, useGiro } from "./BotaoAtualizar";
import { IconDownload, IconKey, IconPlug, IconPlus, IconTrash } from "./icons";
import { Switch } from "./Switch";
import { toast } from "./Toast";
import { GravadorReceitas, type PassoGravado } from "./GravadorReceitas";
import { HistoricoExecucoes } from "./HistoricoExecucoes";
import { FluxosAutomacao } from "./fluxos/FluxosAutomacao";
import type { GestaoAutomacao } from "./automacao/ProtocolosAutomacao";
import type { ContextoEmissor } from "@/lib/automacao-dfds-motor";
import type { ContextoImportacao } from "@/lib/importar-protocolo-auto";

// Tela AUTOMAÇÃO (só ADM): baixa DFDs da Centi ("Emitir DFD" do CM002 Planejamento) por PROTOCOLO do sistema (uma pasta
// por protocolo, dentro da pasta "PCA <ano>") ou por Id. Quem fala com a Centi é a EXTENSÃO do Chrome (extensao-centi/),
// usando a sessão da Centi (o login de cada ADM fica cifrado no banco e só a extensão o lê). Destino: uma PASTA (Downloads ou a escolhida) ou
// ANEXAR os PDFs a um PROTOCOLO da Centi informado pelo ADM (Id + nº): a única gravação na Centi, montada e travada na
// extensão (abre o protocolo, confere Id + nº, acrescenta UM documento, não repete a mesma descrição).
// Cada DFD é emitido na ENTIDADE da Centi do órgão dele e CONFERIDO (é um PDF, traz o planejamento e o DFD pedidos, a
// gravação bateu o tamanho) antes de contar como salvo.

const CHAVE_CONFIG = "automacao:centi";
const CHAVE_ENTIDADES = "automacao:centi-entidades";

type Resposta = {
  ok: boolean;
  erro?: string;
  logado?: boolean;
  entidade?: string | null;
  /** A operação "Emitir DFD" que a extensão pegou da própria tela da Centi (o Processar). */
  operacao?: unknown;
  /** A aba da Centi está na TELA DE LOGIN (a sessão caiu). */
  tela?: "login";
  /** O login automático: `credenciais` = há login guardado no sistema para quem está logado; `semSistema` = a extensão não
   * conseguiu falar com o sistema neste navegador (sem sessão). A senha nunca vem aqui. */
  login?: {
    credenciais: boolean;
    auto: boolean;
    pausado: boolean;
    motivo: string | null;
    semSistema?: boolean;
    /** Este navegador recebe o login (a chave da extensão autorizada no sistema). */
    autorizada?: boolean;
    /** A chave PÚBLICA da extensão (não é segredo) — para autorizar este navegador. */
    chave?: { publica: string; impressao: string } | null;
  } | null;
  /** O lote foi INTERROMPIDO pela extensão (popup ou cartão na aba da automação). */
  interrompido?: boolean;
  /** O andamento do último lote, como a extensão o guardou (sobrevive ao F5 desta tela). */
  atividade?: { estado: string; titulo: string; passo: string; atualizado: number } | null;
  loteId?: string;
};
type Ext = { versao: string; copias: number } | null;
/** O contexto dos BANNERS da Mesa (o protocolo aberto pela linha): o mesmo da Mesa (`contextoBanners`). */
export type ContextoBannersAutomacao = Pick<Parameters<typeof BannersMesa>[0], "pode" | "reparticoes" | "regras" | "orgaos" | "pcas">;
/** O ID da entidade na Centi cadastrado em cada órgão (Órgãos e Unidades). */
type OrgaoCenti = { id: number; entidadeCenti?: string | null };

/** Conversa com a extensão pela ponte da página (window.postMessage). */
function useExtensaoCenti() {
  const [ext, setExt] = useState<Ext>(null);
  const versao = useRef("");
  const copias = useRef(new Map<string, string>());
  const seq = useRef(0);
  const pendentes = useRef(new Map<number, (r: Resposta) => void>());
  // O LOTE em curso (o andamento vai à extensão — selo no ícone, cartão na aba da automação e popup) e a INTERRUPÇÃO
  // pedida pela extensão: os pedidos do lote levam o id e a extensão recusa os que vêm depois de interromper.
  const lote = useRef<string | null>(null);
  const interrompido = useRef(false);
  useEffect(() => {
    const ouvir = (e: MessageEvent) => {
      if (e.source !== window || e.data?.fonte !== "pca-extensao") return;
      if (e.data.tipo === "interrompido") {
        if (lote.current && e.data.loteId === lote.current) interrompido.current = true;
        return;
      }
      if (e.data.tipo === "pronto") {
        // Vale a MAIOR versão anunciada (uma cópia antiga que ficou na aba também se anuncia).
        const v = String(e.data.versao ?? "");
        // Cada CÓPIA instalada se anuncia com o id dela (desde a 1.4.1): duas cópias = aviso (as duas ouviriam os pedidos).
        // Conta só as cópias da MESMA versão (a antiga que sobrou de uma atualização não ouve os pedidos — `v`).
        if (typeof e.data.idExtensao === "string") copias.current.set(e.data.idExtensao, v);
        if (versao.current && maiorVersao(versao.current, v) === versao.current && v !== versao.current) return;
        versao.current = maiorVersao(versao.current || "0", v);
        const atual = versao.current;
        setExt({ versao: atual, copias: [...copias.current.values()].filter((x) => x === atual).length });
        return;
      }
      // Só a resposta da ponte ATUAL (uma cópia antiga da extensão que ficou na aba também ouve).
      if (e.data.v !== versao.current) return;
      const f = pendentes.current.get(e.data.id);
      if (f) {
        pendentes.current.delete(e.data.id);
        f(e.data.resposta ?? { ok: false, erro: "Sem resposta da extensão." });
      }
    };
    window.addEventListener("message", ouvir);
    window.postMessage({ fonte: "pca-automacao", tipo: "ola" }, window.location.origin);
    return () => window.removeEventListener("message", ouvir);
  }, []);
  const pedir = useCallback((acao: string, dados: unknown, ms: number) => {
    const id = ++seq.current;
    return new Promise<Resposta>((ok) => {
      const t = window.setTimeout(() => {
        pendentes.current.delete(id);
        ok({ ok: false, erro: "A extensão não respondeu a tempo." });
      }, ms);
      pendentes.current.set(id, (r) => {
        window.clearTimeout(t);
        ok(r);
      });
      window.postMessage({ fonte: "pca-automacao", v: versao.current, id, acao, dados, lote: lote.current ?? undefined }, window.location.origin);
    });
  }, []);
  return { ext, pedir, lote, interrompido };
}

function lerLocal<T>(chave: string, ler: (v: unknown) => T, padrao: T): T {
  try {
    return ler(JSON.parse(localStorage.getItem(chave) ?? "null"));
  } catch {
    return padrao;
  }
}
function gravarLocal(chave: string, v: unknown) {
  try {
    localStorage.setItem(chave, JSON.stringify(v));
  } catch {}
}
const lerMapa = (v: unknown): Record<string, string> =>
  Object.fromEntries(Object.entries(v && typeof v === "object" ? v : {}).filter(([, x]) => typeof x === "string" && /^[\w.-]{1,40}$/.test(x))) as Record<string, string>;

const URL_EXTENSAO = "/api/admin/automacao/extensao";
const baixarExtensao = () => {
  window.location.href = URL_EXTENSAO;
};

/** A operação Emitir DFD (ModuleKey e Guid) como corpo + chave comparável; inválida = null. */
function chaveOp(op: unknown): { chave: string; corpo: { moduleKey: number; guid: string } } | null {
  const a = ajusteDaOperacao({ ...CONFIG_CENTI_PADRAO, moduleKey: 0, guid: "" }, op);
  if (!a?.moduleKey || !a.guid) return null;
  const corpo = { moduleKey: a.moduleKey, guid: a.guid };
  return { chave: JSON.stringify(corpo), corpo };
}
function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 border-b border-border px-1 pb-3 last:border-0 last:pb-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{titulo}</p>
      {children}
    </div>
  );
}

type SituacaoLogin = {
  tem: boolean;
  usuario: string;
  auto: boolean;
  atualizadoEm: string | null;
  ultimoUsoEm: string | null;
  pausadoEm: string | null;
  motivo: string | null;
  disponivel: boolean;
  ilegivel: boolean;
  navegadores: { id: number; navegador: string; criadoEm: string; usadoEm: string | null }[];
};

/**
 * O LOGIN DA CENTI (de cada ADM) — salvo AQUI, cifrado no banco: vale em qualquer navegador, com qualquer versão da
 * extensão. A senha nunca volta a esta tela (vazia = mantém a guardada); a extensão só a recebe SELADA à chave dela, num
 * navegador autorizado (sozinho logo depois de entrar no sistema nele; ou aqui, com a senha do sistema).
 */
function LoginDaCenti({
  foco,
  onSalvo,
  confirmar,
  extensao,
}: {
  foco: boolean;
  onSalvo: () => void;
  confirmar: ReturnType<typeof useConfirmacao>["confirmar"];
  /** A extensão deste navegador: a chave pública (para autorizar) e se já está autorizada. */
  extensao: { publica: string; autorizada: boolean } | null;
}) {
  const [s, setS] = useState<SituacaoLogin | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [auto, setAuto] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [senhaSistema, setSenhaSistema] = useState("");
  const [autorizando, setAutorizando] = useState(false);
  const aplicar = useCallback((j: SituacaoLogin) => {
    setS(j);
    setAuto(j.auto);
    setUsuario("");
    setSenha("");
  }, []);
  const carregar = useCallback(async () => {
    const r = await fetch("/api/admin/automacao/credencial-centi", { cache: "no-store" }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as ({ ok?: boolean; error?: string } & SituacaoLogin) | null;
    if (j?.ok) {
      aplicar(j);
      setFalha(null);
    } else setFalha(j?.error ?? "Não consegui ler o login da Centi — tente de novo.");
  }, [aplicar]);
  useEffect(() => {
    void carregar();
  }, [carregar]);
  const mudou = !!usuario.trim() || !!senha || (s?.tem === true && (auto !== s.auto || !!s.pausadoEm));
  const falta = !s?.tem && (!usuario.trim() || !senha);
  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!mudou || falta || salvando) return;
    setSalvando(true);
    const r = await fetch("/api/admin/automacao/credencial-centi", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ usuario: usuario.trim() || null, senha: senha || null, auto }),
    }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as ({ ok?: boolean; error?: string } & SituacaoLogin) | null;
    setSalvando(false);
    if (!j?.ok) return toast.error(j?.error ?? "Não consegui salvar o login da Centi.");
    aplicar({ ...j, disponivel: true });
    toast.success("Login da Centi salvo (cifrado).");
    onSalvo();
  }
  async function remover() {
    const sim = await confirmar({
      titulo: "Remover o login da Centi?",
      texto: "A extensão deixa de entrar sozinha na Centi em todos os navegadores até você salvar de novo.",
      confirmar: "Remover",
      perigo: true,
    });
    if (!sim) return;
    const r = await fetch("/api/admin/automacao/credencial-centi", { method: "DELETE" }).catch(() => null);
    if (!r?.ok) return toast.error("Não consegui remover — tente de novo.");
    toast.success("Login da Centi removido.");
    await carregar();
  }
  async function autorizar(e: React.FormEvent) {
    e.preventDefault();
    if (!extensao || !senhaSistema || autorizando) return;
    setAutorizando(true);
    const r = await fetch("/api/admin/automacao/credencial-centi/navegadores", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ publica: extensao.publica, navegador: "", senha: senhaSistema }),
    }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    setAutorizando(false);
    setSenhaSistema("");
    if (!j?.ok) return toast.error(j?.error ?? "Não consegui autorizar este navegador.");
    toast.success("Navegador autorizado.");
    await carregar();
    onSalvo();
  }
  async function tirarNavegador(id: number, nome: string) {
    const sim = await confirmar({
      titulo: "Remover este navegador?",
      texto: `${nome} deixa de receber o login da Centi até ser autorizado de novo.`,
      confirmar: "Remover",
      perigo: true,
    });
    if (!sim) return;
    const r = await fetch(`/api/admin/automacao/credencial-centi/navegadores?id=${id}`, { method: "DELETE" }).catch(() => null);
    if (!r?.ok) return toast.error("Não consegui remover — tente de novo.");
    await carregar();
  }
  const agora = Date.now();
  return (
    <Grupo titulo="Login da Centi">
      <form className="space-y-2" onSubmit={salvar} autoComplete="off">
        <div className="flex flex-wrap items-center gap-2">
          {s === null ? (
            <span className="text-xs text-muted">{falha ?? "Conferindo…"}</span>
          ) : s.pausadoEm ? (
            <Badge tone="amber" dot title={s.motivo ?? undefined}>
              Pausado — {s.motivo ?? "a Centi recusou a senha"}. Confira e salve para retomar.
            </Badge>
          ) : s.ilegivel ? (
            <Badge tone="red" dot>
              O login guardado não abre (a chave do sistema mudou) — salve de novo
            </Badge>
          ) : s.tem ? (
            <Badge tone="emerald" dot>
              Guardado{s.atualizadoEm ? ` em ${dataHoraBR(s.atualizadoEm)}` : ""}
              {s.ultimoUsoEm ? ` · usado ${haQuanto(s.ultimoUsoEm, agora)}` : ""}
            </Badge>
          ) : (
            <Badge tone="amber" dot>
              Não configurado
            </Badge>
          )}
          <Ajuda titulo="Login da Centi" botao="sm">
            <p>
              O usuário e a senha da Centi ficam <strong>cifrados no banco</strong>, na sua conta — valem em qualquer navegador
              e com qualquer versão do sistema ou da extensão. A senha nunca volta a esta tela: deixe em branco para manter a
              guardada.
            </p>
            <p>
              A senha só sai do sistema <strong>selada</strong> à chave da extensão de um navegador autorizado — nem quem tivesse
              o cookie da sua sessão a leria. Em outro computador, basta entrar no sistema com a extensão instalada: o navegador
              se autoriza sozinho e a Centi entra. Depois disso, só com a senha do sistema (aqui embaixo). Cada navegador
              autorizado gera um aviso para você.
            </p>
            <p>
              Se a Centi recusar a senha, o login é <strong>pausado</strong> em todos os navegadores (a conta na Centi não é
              bloqueada) até você salvar de novo.
            </p>
          </Ajuda>
        </div>
        {s?.disponivel === false ? (
          <p className="text-xs text-[var(--danger)]">O sistema está sem a chave mestra para cifrar o login (INTEGRACOES_CHAVE).</p>
        ) : (
          <>
            <TextField
              compacto
              label="Usuário"
              autoFocus={foco}
              value={usuario}
              placeholder={s?.tem ? `${s.usuario} (guardado)` : "Usuário da Centi"}
              onChange={(e) => setUsuario(e.target.value)}
              name="centi-usuario"
              autoComplete="off"
              spellCheck={false}
              maxLength={120}
            />
            <PasswordField
              compacto
              label="Senha da Centi"
              value={senha}
              placeholder={s?.tem ? "•••••• (guardada)" : "Senha da Centi"}
              onChange={(e) => setSenha(e.target.value)}
              name="centi-chave"
              autoComplete="off"
              data-lpignore="true"
              maxLength={200}
            />
            <Switch checked={auto} onChange={setAuto} label="Entrar sozinho quando a sessão cair" />
            <div className="flex flex-wrap items-center justify-end gap-2">
              {s?.tem && (
                <Button size="sm" variant="secondary" onClick={() => void remover()}>
                  Remover
                </Button>
              )}
              <Button size="sm" variant="primary" type="submit" loading={salvando} disabled={!mudou || falta}>
                <IconKey className="h-4 w-4" /> {s?.pausadoEm ? "Salvar e retomar" : "Salvar"}
              </Button>
            </div>
          </>
        )}
      </form>
      {s?.tem && extensao && !extensao.autorizada && (
        <form className="space-y-2 border-t border-border pt-2" onSubmit={autorizar} autoComplete="off">
          <p className="text-xs text-muted">Este navegador ainda não recebe o login. Confirme com a senha do sistema (ou entre no sistema de novo neste navegador).</p>
          <PasswordField compacto label="Sua senha do sistema" value={senhaSistema} onChange={(e) => setSenhaSistema(e.target.value)} autoComplete="current-password" maxLength={128} />
          <div className="flex justify-end">
            <Button size="sm" variant="primary" type="submit" loading={autorizando} disabled={!senhaSistema}>
              Autorizar este navegador
            </Button>
          </div>
        </form>
      )}
      {!!s?.navegadores.length && (
        <div className="space-y-1 border-t border-border pt-2">
          <p className="text-xs font-medium text-text-2">Navegadores autorizados</p>
          <ul className="space-y-1">
            {s.navegadores.map((n) => (
              <li key={n.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0 truncate" title={`Autorizado em ${dataHoraBR(n.criadoEm)}`}>
                  {n.navegador}
                  <span className="text-muted"> · {n.usadoEm ? `usado ${haQuanto(n.usadoEm, agora)}` : "ainda não usado"}</span>
                </span>
                <Button size="xs" variant="icon" aria-label={`Remover ${n.navegador}`} title="Remover este navegador" onClick={() => void tirarNavegador(n.id, n.navegador)}>
                  <IconTrash className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Grupo>
  );
}

/** Os AJUSTES (o dropdown do botão "Ajustes"): saída, emissão e entidade da Centi por órgão. */
function Ajustes({
  cfg,
  onCfg,
  orgaos,
  mapa,
  fixas,
  onEntidade,
  aberta,
  gravacao,
  onGravacao,
  onHistorico,
  gravando,
  onGravador,
  focoLogin,
  onLoginSalvo,
  confirmar,
  extensaoLogin,
}: {
  extensaoLogin: { publica: string; autorizada: boolean } | null;
  /** O cursor já no usuário (aberto pelo "Configurar login"). */
  focoLogin: boolean;
  /** Salvo o login: a extensão tenta entrar na hora. */
  onLoginSalvo: () => void;
  confirmar: ReturnType<typeof useConfirmacao>["confirmar"];
  /** O gravador de receitas na aba da Centi (null = desconhecido). */
  gravando: boolean | null;
  onGravador: (acao: "iniciar" | "parar") => void;
  /** O freio de emergência da plataforma (null = não lido). */
  gravacao: boolean | null;
  onGravacao: (ativa: boolean) => void;
  onHistorico: () => void;
  cfg: ConfigCenti;
  onCfg: (p: Partial<ConfigCenti>) => void;
  orgaos: [string, { nome: string; n: number }][];
  mapa: Record<string, string>;
  /** As entidades CADASTRADAS no órgão (Órgãos e Unidades) — valem sempre; não se tenta nem se edita aqui. */
  fixas: Record<string, string>;
  onEntidade: (orgao: string, entidade: string) => void;
  aberta: string | null;
}) {
  return (
    <div className="space-y-3 p-1">
      <LoginDaCenti foco={focoLogin} onSalvo={onLoginSalvo} confirmar={confirmar} extensao={extensaoLogin} />
      <Grupo titulo="Gravação na Centi">
        <div className="flex flex-wrap items-center justify-between gap-2">
        <Switch
          checked={gravacao !== false}
          disabled={gravacao === null}
          onChange={onGravacao}
          label={gravacao === false ? "Pausada (freio de emergência)" : "Ligada"}
        />
        <Button size="sm" variant="secondary" onClick={onHistorico}>
          Histórico das execuções
        </Button>
        </div>
      </Grupo>
      <Grupo titulo="Gravador de receitas">
        <p className="text-xs text-muted">
          Grava a FORMA dos pedidos que a tela da Centi faz (sem valores) — ligue, faça a ação lá e pare para ver e copiar.
        </p>
        <Button size="sm" variant={gravando ? "danger" : "secondary"} onClick={() => onGravador(gravando ? "parar" : "iniciar")} disabled={gravando === null}>
          {gravando ? "Parar e ver a gravação" : "Gravar uma ação na Centi"}
        </Button>
      </Grupo>
      <Grupo titulo="Emissão do DFD">
        <Switch checked={cfg.valorReferencia} onChange={(v) => onCfg({ valorReferencia: v })} label="Emitir valor de referência" dica="Vale no Baixar/anexar DFDs. A conferência com a Centi sempre emite com o valor de referência." />
        <Switch checked={cfg.emitirData} onChange={(v) => onCfg({ emitirData: v })} label="Emitir data" />
      </Grupo>
      <Grupo titulo="Órgão na Centi (ID)">
        <p className="text-[12px] text-muted">O ID cadastrado no órgão (Órgãos e Unidades) vale sempre; descobrir/tentar só para os órgãos sem ele.</p>
        <Switch checked={cfg.descobrirEntidade} onChange={(v) => onCfg({ descobrirEntidade: v })} label="Descobrir sozinho (órgãos sem ID)" />
        <TextField label="IDs de órgão a tentar" placeholder={aberta ? `vazio = 0 a 28 (aberta: ${aberta})` : "02:03:04"} value={cfg.entidades} onChange={(e) => onCfg({ entidades: e.target.value })} />
        {orgaos.length > 0 && (
          <ul className="max-h-56 divide-y divide-border overflow-y-auto">
            {orgaos.map(([chave, o]) => (
              <li key={chave} className="flex items-center gap-2 py-1 text-sm">
                <span className="min-w-0 flex-1 truncate text-text" title={`${o.nome} · ${o.n} DFD(s)`}>
                  {o.nome}
                </span>
                {fixas[chave] ? (
                  <span className="w-16 shrink-0 text-center font-mono text-[12px] text-muted" title="Cadastrado no órgão">
                    {fixas[chave]}
                  </span>
                ) : (
                <input
                  aria-label={`Entidade da Centi de ${o.nome}`}
                  className={`${cellCls} w-16 shrink-0 text-center`}
                  placeholder="auto"
                  defaultValue={mapa[chave] ?? ""}
                  key={mapa[chave] ?? ""}
                  onBlur={(e) => onEntidade(chave, e.target.value)}
                />
                )}
                {!fixas[chave] && aberta && mapa[chave] !== aberta && (
                  <Button size="xs" variant="ghost" onClick={() => onEntidade(chave, aberta)} title="Usar o órgão aberto na Centi agora">
                    {aberta}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Grupo>
      <Grupo titulo="Avançado">
        <p className="text-xs text-muted">
          Seções 8 a 10 do DFD: o registro de cada planejamento é lido do próprio planejamento aberto na Centi, como a tela dela faz.
        </p>
        <TextField label="ModuleKey" value={String(cfg.moduleKey)} inputMode="numeric" onChange={(e) => onCfg({ moduleKey: Number(e.target.value) })} />
        <TextField label="Guid da operação" value={cfg.guid} onChange={(e) => onCfg({ guid: e.target.value })} />
      </Grupo>
    </div>
  );
}

export function AutomacaoAdmin({
  protocolos,
  gestao,
  banners,
}: {
  protocolos: ProtocoloAutomacao[];
  gestao: GestaoAutomacao;
  banners: ContextoBannersAutomacao;
}) {
  const router = useRouter();
  const { ext, pedir, lote: loteRef, interrompido: interrompidoRef } = useExtensaoCenti();
  const [cfg, setCfg] = useState<ConfigCenti>(CONFIG_CENTI_PADRAO);
  const [mapa, setMapa] = useState<Record<string, string>>({});
  const mapaRef = useRef(mapa);
  // Órgão → ID da entidade na Centi CADASTRADO em Órgãos e Unidades (vale mais que o mapa do aparelho).
  const cadastradas = useMemo(
    () => Object.fromEntries((banners.orgaos as OrgaoCenti[]).filter((o) => o.entidadeCenti).map((o) => [`o:${o.id}`, o.entidadeCenti as string])),
    [banners.orgaos],
  );
  const cadastradasRef = useRef(cadastradas);
  cadastradasRef.current = cadastradas;
  const [logado, setLogado] = useState<Resposta | null>(null);
  const [rodando, setRodando] = useState(false);
  /** "Novo fluxo" do cabeçalho: cada toque abre o painel (o contador da Mesa); some dentro de um fluxo aberto. */
  const [novoFluxo, setNovoFluxo] = useState(0);
  const [noEditor, setNoEditor] = useState(false);
  const [aberto, setAberto] = useState<AberturaMesa | null>(null);
  const { confirmar, confirmacao } = useConfirmacao();
  useEffect(() => {
    setCfg(lerLocal(CHAVE_CONFIG, lerConfigCenti, CONFIG_CENTI_PADRAO));
    const m = lerLocal(CHAVE_ENTIDADES, lerMapa, {});
    mapaRef.current = m;
    setMapa(m);
  }, []);
  // A configuração mais recente (a emissão roda em laço assíncrono e pode ser ajustada no meio dele).
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  const mudar = (p: Partial<ConfigCenti>) => {
    const n = lerConfigCenti({ ...cfgRef.current, ...p });
    cfgRef.current = n;
    setCfg(n);
    gravarLocal(CHAVE_CONFIG, n);
  };
  // A operação "Emitir DFD" que a extensão pegou da tela da Centi: se a Centi a mudou, o sistema acompanha sozinho.
  // A operação guardada no SERVIDOR (vale para todos os ADMs): a da tela da Centi que for diferente vai para lá.
  const opServidor = useRef<string | null>(null);
  const compartilharOperacao = (op: unknown) => {
    const k = chaveOp(op);
    if (!k || k.chave === opServidor.current) return;
    opServidor.current = k.chave;
    void fetch("/api/admin/automacao/config", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ operacao: k.corpo }),
    }).catch(() => {
      opServidor.current = null;
    });
  };
  const aplicarOperacao = (op: unknown, doServidor = false): boolean => {
    if (!doServidor) compartilharOperacao(op);
    const a = ajusteDaOperacao(cfgRef.current, op);
    if (!a) return false;
    mudar(a);
    if (!doServidor) toast.success(`A Centi mudou a operação Emitir DFD — o sistema já se ajustou (ModuleKey ${cfgRef.current.moduleKey}).`, 10_000);
    return true;
  };
  const aplicarRef = useRef(aplicarOperacao);
  aplicarRef.current = aplicarOperacao;
  const definirEntidade = useCallback((orgao: string, entidade: string) => {
    const v = entidade.trim();
    const n = { ...mapaRef.current };
    if (v && /^[\w.-]{1,40}$/.test(v)) n[orgao] = v;
    else delete n[orgao];
    mapaRef.current = n;
    setMapa(n);
    gravarLocal(CHAVE_ENTIDADES, n);
  }, []);
  // O EMISSOR de DFDs dos fluxos: lê a configuração e o mapa VIVOS (refs) — ajustes no meio de um lote valem já.
  const emissor = useMemo<ContextoEmissor>(
    () => ({
      pedir: pedir as unknown as ContextoEmissor["pedir"],
      cfg: () => cfgRef.current,
      aplicarOperacao: (op) => aplicarRef.current(op),
      mapa: () => mapaRef.current,
      cadastradas: () => cadastradasRef.current,
      definirEntidade,
    }),
    [pedir, definirEntidade],
  );

  // `abrir` = a extensão abre a ABA DA AUTOMAÇÃO na Centi se ela não existir (ao abrir esta tela e no Verificar; a
  // conferência a cada 20 s não reabre a aba que o usuário fechou).
  const avisouParada = useRef(false);
  const giroVerificar = useGiro();
  const verificar = useCallback(
    async (abrir = false) => {
      const r = await pedir("estado", abrir ? { abrir: true } : null, abrir ? 45_000 : 8000);
      setLogado(r);
      if (r.ok && r.operacao) aplicarRef.current(r.operacao);
      // O lote parou porque esta tela foi recarregada (F5) no meio: avisa uma vez o último passo.
      const a = r.atividade;
      if (!avisouParada.current && a && a.estado === "parado" && Date.now() - a.atualizado < 30 * 60_000) {
        avisouParada.current = true;
        toast.info(`O último lote (${a.titulo}) parou: ${a.passo}`, 12_000);
      }
    },
    [pedir],
  );
  // LOGIN AUTOMÁTICO: a extensão entra com o login guardado NO SISTEMA (cifrado no banco — lido só por ela).
  const [entrando, setEntrando] = useState(false);
  const entrarAgora = useCallback(async () => {
    setEntrando(true);
    const r = await pedir("entrarAgora", null, 60_000);
    setEntrando(false);
    setLogado(r);
    if (r.ok && r.logado) toast.success("Centi logada.");
    else toast.error(r.login?.pausado ? (r.login.motivo ?? "Login automático pausado.") : (r.erro ?? "Não consegui entrar na Centi."));
  }, [pedir]);
  // "Configurar login" (o selo da Centi, ou o popup da extensão por `?ajustes=login`): abre os ajustes no login da Centi.
  const [ajustesAbertos, setAjustesAbertos] = useState(false);
  const [focoLogin, setFocoLogin] = useState(false);
  const abrirLoginCenti = useCallback(() => {
    setFocoLogin(true);
    setAjustesAbertos(true);
  }, []);
  useEffect(() => {
    const u = new URL(window.location.href);
    if (u.searchParams.get("ajustes") !== "login") return;
    u.searchParams.delete("ajustes");
    window.history.replaceState(window.history.state, "", u.toString());
    abrirLoginCenti();
  }, [abrirLoginCenti]);
  // AO VIVO: a extensão se anuncia sozinha (instalada/atualizada — sem F5); o estado da Centi é conferido ao abrir, ao
  // voltar à janela e a cada 20 s com a tela à vista (fora do meio de um lote — o canal fica com a Centi).
  const rodandoRef = useRef(false);
  rodandoRef.current = rodando;
  // Sair desta tela no meio de um lote o PARA (a extensão não segue sozinha): avisa antes.
  useEffect(() => {
    if (!rodando) return;
    const avisar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [rodando]);
  useEffect(() => {
    if (!ext || !versaoFunciona(ext.versao)) return;
    void verificar(true);
    const ver = () => {
      if (document.visibilityState === "visible" && !rodandoRef.current) void verificar();
    };
    const t = window.setInterval(ver, 20_000);
    window.addEventListener("focus", ver);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("focus", ver);
    };
  }, [ext, verificar]);

  // O FREIO de emergência (Configuração da plataforma, no servidor): desligado, nenhuma gravação na Centi passa.
  const [gravacao, setGravacao] = useState<boolean | null>(null);
  const [historico, setHistorico] = useState(false);
  // O GRAVADOR de receitas (na aba da Centi): ligar → o ADM faz a ação lá → parar mostra a estrutura gravada.
  const [gravando, setGravando] = useState(false);
  const [gravados, setGravados] = useState<PassoGravado[] | null>(null);
  const usarGravador = async (acao: "iniciar" | "parar") => {
    const r = (await pedir("gravador", { acao }, 8000)) as Resposta & { gravando?: boolean; passos?: PassoGravado[] };
    if (!r.ok) {
      toast.error(`Gravador: ${r.erro ?? "a extensão não respondeu."}`);
      return;
    }
    setGravando(r.gravando === true);
    if (acao === "iniciar") toast.info("Gravando: faça a ação na tela da Centi e volte para parar.", 10_000);
    else setGravados(r.passos ?? []);
  };
  useEffect(() => {
    fetch("/api/admin/automacao/config")
      .then((r) => r.json())
      .then((j: unknown) => {
        const x = j as { ok?: boolean; config?: { ativa?: boolean; operacao?: unknown } } | null;
        setGravacao(x?.ok ? x.config?.ativa !== false : null);
        // A operação que outro ADM (ou outra aba) já aprendeu da Centi vale aqui também.
        if (x?.ok && x.config?.operacao) {
          opServidor.current = chaveOp(x.config.operacao)?.chave ?? null;
          aplicarRef.current(x.config.operacao, true);
        }
      })
      .catch(() => setGravacao(null));
  }, []);
  const mudarGravacao = async (ativa: boolean) => {
    if (!ativa) {
      const sim = await confirmar({
        titulo: "Pausar a gravação na Centi?",
        texto: "Nenhum anexo será gravado (por ninguém) até ligar de novo. Uma gravação em andamento para no próximo documento.",
        confirmar: "Pausar",
      });
      if (!sim) return;
    }
    try {
      const r = await fetch("/api/admin/automacao/config", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ativa }) });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string; config?: { ativa?: boolean } } | null;
      if (!r.ok || !j?.ok) throw new Error(j?.error ?? "Falha ao gravar.");
      setGravacao(j.config?.ativa !== false);
      toast.success(ativa ? "Gravação na Centi ligada." : "Gravação na Centi PAUSADA.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gravar.");
    }
  };

  // Os órgãos dos DFDs do sistema para o mapa órgão → entidade da Centi.
  const orgaos = useMemo(() => {
    const m = new Map<string, { nome: string; n: number }>();
    for (const p of protocolos)
      for (const d of p.dfds)
        if (d.orgao) {
          const o = m.get(d.orgao) ?? { nome: d.orgaoNome ?? d.orgao.slice(2), n: 0 };
          o.n++;
          m.set(d.orgao, o);
        }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [protocolos]);

  // FUNCIONA = roda as automações (≥ a mínima); RECOMENDADA = a publicada junto. Versão nova da extensão nunca trava.
  const atualizada = !!ext && versaoFunciona(ext.versao);
  const recomendada = !!ext && versaoAtende(ext.versao);
  const pronto = atualizada && !!logado?.ok && !!logado.logado;
  const importacao = useMemo(
    () => ({ reparticoes: banners.reparticoes, regras: banners.regras, orgaos: banners.orgaos, pcas: banners.pcas }) as unknown as ContextoImportacao,
    [banners],
  );
  // Celular/tablet (toque e sem a extensão): a execução precisa do Chrome do computador.
  const [semExtensaoNoAparelho, setSemExtensaoNoAparelho] = useState(false);
  useEffect(() => setSemExtensaoNoAparelho(!ext && window.matchMedia("(pointer: coarse)").matches), [ext]);
  // O ESTADO da extensão e da Centi + o menu "Extensão e Centi" — UMA vez por tela: no cabeçalho da lista e, com um fluxo
  // aberto, no fim da linha do editor (nunca duas linhas com engrenagens/atualizar/ajuda repetidos).
  const estadoExtensao = (
    <div className="flex flex-wrap items-center gap-2">
      {gravacao === false && (
        <Badge tone="red" dot>
          Gravação pausada
        </Badge>
      )}
      {ext && ext.copias > 1 && (
        <Badge tone="amber" dot>
          {ext.copias} cópias da extensão — remova a antiga
        </Badge>
      )}
      {atualizada && !recomendada && (
        <Badge tone="amber" dot className="shrink-0" title={`A extensão ${ext?.versao} funciona; a ${VERSAO_EXTENSAO_CENTI} traz melhorias — baixe e recarregue em chrome://extensions.`}>
          Atualização da extensão disponível
        </Badge>
      )}
      {/* O MESMO selo de estado do PCA (Preview/Publicado — `tamanho="linha"`): o ponto que pulsa = situação ao vivo. */}
      {!ext ? (
        <Badge tone="amber" dot vivo tamanho="linha" className="shrink-0" title="A extensão da Centi não respondeu: instale-a (botão ao lado), abra a Centi no Chrome e entre — conferido a cada 20 s">
          Sem extensão
        </Badge>
      ) : !atualizada ? (
        <Badge tone="amber" dot tamanho="linha" className="shrink-0">
          Extensão v{ext.versao} desatualizada
        </Badge>
      ) : logado?.ok && logado.logado ? (
        <Badge
          tone="emerald"
          dot
          vivo
          tamanho="linha"
          className="shrink-0"
          title={`Ao vivo: a extensão está conectada e a Centi está logada${logado.entidade ? ` na entidade ${logado.entidade}` : ""}. Conferido ao abrir, ao voltar à janela e a cada 20 s.`}
        >
          Centi logada{logado.entidade ? ` · ${logado.entidade}` : ""}
        </Badge>
      ) : logado?.tela === "login" ? (
        <LoginCenti login={logado.login ?? null} entrando={entrando} onEntrar={() => void entrarAgora()} onOpcoes={abrirLoginCenti} />
      ) : (
        <Badge tone="amber" dot tamanho="linha" className="shrink-0">
          {logado?.erro ?? "Centi sem login"}
        </Badge>
      )}
      {/* Sem a extensão em dia ou sem a Centi logada: verificar e baixar à vista (com tudo certo, só no menu). */}
      {(!pronto || !recomendada) && (
        <>
          <BotaoAtualizar
            ativo={giroVerificar.girando}
            rotulo="Verificar"
            dica="Verificar a extensão e a Centi"
            detalhe="Verificando a extensão e a Centi…"
            onClick={() => void giroVerificar.girar(async () => (ext ? void (await verificar(true)) : window.location.reload()))}
          />
          <Button
            size="sm"
            variant={atualizada ? "secondary" : "primary"}
            onClick={baixarExtensao}
            title={`Baixar a extensão ${VERSAO_EXTENSAO_CENTI}`}
            aria-label={`Baixar a extensão ${VERSAO_EXTENSAO_CENTI}`}
          >
            <IconDownload className="h-4 w-4 shrink-0" />
            <span className="tabular-nums">{VERSAO_EXTENSAO_CENTI}</span>
          </Button>
        </>
      )}
      <Dropdown
        papel="dialog"
        aberto={ajustesAbertos}
        onAberto={(a) => {
          setAjustesAbertos(a);
          if (!a) setFocoLogin(false);
        }}
        ariaLabel="Extensão e Centi"
        align="end"
        width={360}
        trigger={
          <span
            title="Extensão e Centi: verificar, baixar a extensão e os ajustes"
            className="inline-flex size-11 items-center justify-center rounded-control border border-border-2 bg-surface text-text desktop:size-[var(--h-control-sm)]"
          >
            <IconPlug className="h-4 w-4" aria-hidden="true" />
          </span>
        }
      >
        <div className="space-y-3">
          {/* Com tudo certo, verificar e baixar ficam SÓ aqui; com problema, estão à vista na linha (nunca nos dois). */}
          {pronto && recomendada && (
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-1 pb-3">
              <BotaoAtualizar
                ativo={giroVerificar.girando}
                rotulo="Verificar"
                dica="Verificar a extensão e a Centi"
                detalhe="Verificando a extensão e a Centi…"
                onClick={() => void giroVerificar.girar(async () => void (await verificar(true)))}
              />
              <Button size="sm" variant="secondary" onClick={baixarExtensao}>
                <IconDownload className="h-4 w-4 shrink-0" /> Baixar a extensão {VERSAO_EXTENSAO_CENTI}
              </Button>
            </div>
          )}
          <Ajustes
            cfg={cfg}
            onCfg={mudar}
            orgaos={orgaos}
            mapa={mapa}
            fixas={cadastradas}
            onEntidade={definirEntidade}
            aberta={logado?.entidade ?? null}
            gravacao={gravacao}
            onGravacao={(v) => void mudarGravacao(v)}
            onHistorico={() => setHistorico(true)}
            gravando={pronto ? gravando : null}
            onGravador={(a) => void usarGravador(a)}
            focoLogin={focoLogin}
            extensaoLogin={logado?.login?.chave ? { publica: logado.login.chave.publica, autorizada: logado.login.autorizada === true } : null}
            onLoginSalvo={() => void entrarAgora()}
            confirmar={confirmar}
          />
        </div>
      </Dropdown>
    </div>
  );
  return (
    <div className="space-y-[var(--gap-block)]">
      {!noEditor && (
        <div className="linha-topico flex flex-wrap items-center gap-2">
          <h1 className="sr-only">Automação</h1>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {estadoExtensao}
            <Button size="sm" variant="primary" onClick={() => setNovoFluxo((n) => n + 1)} title="Novo fluxo" aria-label="Novo fluxo">
              <IconPlus className="h-4 w-4" />
            </Button>
            <Ajuda titulo="Automação — fluxos com a Centi">
              <p>
                Cada automação é um <strong>fluxo</strong> montado com componentes (buscar na Centi, dados do sistema, selecionar,
                ler, comparar, baixar/anexar, apontar erros…). Toda conversa com a Centi é por API, pela extensão do Chrome com o
                login já feito — as telas da Centi nunca são operadas.
              </p>
              <p>
                <strong>Painel do fluxo:</strong> os dados de entrada (os campos dos próprios componentes), as etapas ao vivo e as
                abas de cada componente — a seleção dos protocolos, os DFDs baixados/anexados, os protocolos lidos — e a Análise,
                que acompanha cada item processado em tempo real. O diagrama só aparece em “Diagrama”, para montar o fluxo.
              </p>
              <p>
                <strong>Modelos prontos:</strong> Baixar/anexar DFDs (por protocolo ou por nºs de planejamento), Ler a Tela
                Protocolo, Execução dos DFDs na CM002, Conferir DFDs × Centi e Inclusão PCA — “Usar este modelo”.
              </p>
              <p>
                <strong>Baixar/anexar DFDs:</strong> cada DFD é emitido na entidade da Centi do órgão dele e conferido (o PDF tem de
                trazer o planejamento e o DFD pedidos). Destino: pasta (Downloads, a escolhida ou um .zip com as pastas), o
                protocolo da Centi indicado (Id + nº) ou o protocolo de cada DFD — o anexo leva a autorização de uso único do
                sistema e a sua confirmação na janela da extensão; o já anexado não é emitido de novo.
              </p>
              <p>
                <strong>Segurança:</strong> em Extensão e Centi (o plugue) → Gravação na Centi, o <strong>freio</strong> pausa toda gravação na hora (para
                todos); o <strong>Histórico das execuções</strong> mostra cada lote. A extensão trabalha numa aba PRÓPRIA da Centi
                (grupo azul “Automação PCA”); o ícone dela mostra o andamento e permite <strong>Interromper</strong>. Sair desta tela
                no meio de um fluxo o para.
              </p>
              <p>
                <strong>Extensão:</strong> “Extensão” → descompacte (na atualização, na MESMA pasta) → chrome://extensions → Modo do
                desenvolvedor → Carregar sem compactação (ou ↻) → F5 nesta tela. O login fica salvo nela (e, opcional, cifrado no
                sistema — Extensão e Centi → Login da Centi). <strong>Órgão:</strong> cada DFD vai no órgão da Centi dele (o
                ID cadastrado no órgão; sem ele, o mapa de Extensão e Centi, a aberta e — com “Descobrir sozinho” — as outras).
              </p>
            </Ajuda>
          </div>
        </div>
      )}
      {/* No celular/tablet não há extensões no navegador: ver e editar os fluxos vale; executar, só no computador. */}
      {semExtensaoNoAparelho && (
        <Callout kind="info">
          Para executar as automações use o Chrome do computador, com a extensão da Centi instalada. Neste aparelho dá para
          ver e editar os fluxos.
        </Callout>
      )}

      <FluxosAutomacao
        pedir={pedir}
        lote={loteRef}
        interrompido={interrompidoRef}
        pronto={pronto}
        emissor={emissor}
        atual={logado?.entidade ?? null}
        protocolos={protocolos}
        gestao={gestao}
        importacao={importacao}
        onAbrirMesa={setAberto}
        onRodando={setRodando}
        novo={novoFluxo}
        onEditor={setNoEditor}
        extensao={estadoExtensao}
      />

      <BannersMesa
        abrir={aberto}
        onFechar={() => setAberto(null)}
        onAbrir={setAberto}
        pode={banners.pode}
        reparticoes={banners.reparticoes}
        reparticaoAtivaId={null}
        regras={banners.regras}
        orgaos={banners.orgaos}
        pcas={banners.pcas}
        onAlterado={() => router.refresh()}
      />
      {historico && <HistoricoExecucoes onFechar={() => setHistorico(false)} />}
      {gravados && <GravadorReceitas passos={gravados} onFechar={() => setGravados(null)} />}
      {confirmacao}
    </div>
  );
}

/** A aba da Centi está na TELA DE LOGIN: a situação do login automático + Entrar agora / Configurar login (os ajustes). */
function LoginCenti({
  login,
  entrando,
  onEntrar,
  onOpcoes,
}: {
  login: Resposta["login"];
  entrando: boolean;
  onEntrar: () => void;
  onOpcoes: () => void;
}) {
  const pronto = !!login?.credenciais && !login.pausado && login.autorizada !== false;
  const detalhe = login?.semSistema
    ? "A extensão não consegue falar com o sistema neste navegador — entre no sistema PCA"
    : !login?.credenciais
    ? "Sem login da Centi salvo no sistema"
    : login.autorizada === false
    ? "Este navegador ainda não recebe o login — entre no sistema de novo nele ou autorize nos Ajustes"
    : login.pausado
      ? (login.motivo ?? "Login automático pausado")
      : login.auto
        ? "a extensão entra sozinha (depois de uma falha, espera 5 min entre as tentativas)"
        : "login automático desligado";
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Badge tone={login?.pausado ? "red" : "amber"} dot>
        {/* O que está acontecendo À VISTA (não só na dica): entrando sozinha, sem login salvo ou pausado (com o motivo). */}
        <span title={detalhe}>
          {!login
            ? "Centi pede login"
            : login.pausado
              ? "Login da Centi pausado"
              : !login.credenciais
                ? "Centi pede login — sem login salvo no sistema"
                : login.autorizada === false
                  ? "Centi pede login — autorize este navegador"
                  : login.auto
                  ? "Centi pede login — o login automático entra sozinho"
                  : "Centi pede login"}
        </span>
      </Badge>
      {pronto && (
        <Button size="sm" variant="secondary" onClick={onEntrar} loading={entrando} title="A extensão entra agora com o login guardado no sistema">
          Entrar agora
        </Button>
      )}
      <Button size="sm" variant="secondary" onClick={onOpcoes} title={detalhe} aria-label={`Configurar login — ${detalhe}`}>
        <IconKey className="h-4 w-4" /> Configurar login
      </Button>
    </span>
  );
}
