// TERMO DE USO + APARELHOS DA CONTA — a configuração do ADM e as regras de APARELHO (núcleo PURO, testado em
// tests/termo-aparelhos.test.ts). Blob `configuracoes`, chave `acessoConta`. Padrão = DESLIGADO: nada muda para ninguém
// até o ADM pôr em TESTE (só os testadores) ou ATIVO (todos).

export const MODOS_IMPLANTACAO = ["desligado", "teste", "ativo"] as const;
export type ModoImplantacao = (typeof MODOS_IMPLANTACAO)[number];

export type ConfigAcessoConta = {
  /** Implantação: desligado · teste (só os testadores) · ativo (todos). */
  modo: ModoImplantacao;
  /** Os usuários do TESTE. */
  testadores: number[];
  /** No ATIVO: as regras valem para TODOS (quem entrar depois também) ou só para as pessoas ESCOLHIDAS (+ os testadores). */
  alcance: "todos" | "escolhidos";
  /** As pessoas escolhidas no ATIVO com `alcance` = "escolhidos". */
  exigidos: number[];
  /** No teste: cada login do testador começa do zero (aceita o termo e nomeia o aparelho de novo; sem trava). */
  repetirAoEntrar: boolean;
  /** Aparelhos por conta (padrão) — 1 a 10. */
  limite: number;
  /** Exceções por papel (id do papel → limite). */
  porPapel: Record<string, number>;
  /** Dias sem nova troca depois que a pessoa troca um aparelho (0 = sem trava). */
  trocaDias: number;
  /** O Administrador fica de fora do limite (padrão; no teste, o ADM testador segue as regras). */
  isentarAdm: boolean;
  /** Segundos até o banner "Termo de Uso aceito" fechar sozinho (0 = não fecha sozinho). */
  fecharAceiteS: number;
  /** Mostra o banner "Termo de Uso aceito" depois de assinar (desligado = segue direto ao sistema). */
  telaAceito: boolean;
  /** A pessoa pode BAIXAR o comprovante assinado (desligado = só visualiza; o ADM sempre baixa). */
  baixarComprovante: boolean;
  /** O encarregado pelo tratamento de dados pessoais (LGPD art. 41) — vai às cláusulas automáticas. */
  encarregado: { nome: string; email: string; telefone: string };
  /** As cláusulas automáticas DESLIGADAS pelo ADM (ids de `CLAUSULAS_AUTO`) — saem do termo publicado. */
  clausulasOff: string[];
};

export const LIMITE_MIN = 1;
export const LIMITE_MAX = 10;
export const TROCA_MAX_DIAS = 180;
export const MAX_TESTADORES = 200;
export const MAX_EXIGIDOS = 5000;
export const OPCOES_TROCA_DIAS = [0, 1, 7, 15, 30, 60, 90, 180] as const;
export const OPCOES_FECHAR_ACEITE = [0, 5, 10, 15, 30, 60] as const;

export const ACESSO_CONTA_PADRAO: ConfigAcessoConta = {
  modo: "desligado",
  testadores: [],
  alcance: "todos",
  exigidos: [],
  repetirAoEntrar: false,
  limite: 2,
  porPapel: {},
  trocaDias: 30,
  isentarAdm: true,
  fecharAceiteS: 10,
  telaAceito: true,
  baixarComprovante: true,
  encarregado: { nome: "", email: "", telefone: "" },
  clausulasOff: [],
};

/** As cláusulas automáticas que o ADM pode desligar (a ordem do termo). */
export const CLAUSULAS_AUTO = [
  { id: "aparelhos", titulo: "Aparelhos vinculados à conta" },
  { id: "sessao", titulo: "Sessão e credenciais" },
  { id: "registros", titulo: "Registros de acesso e auditoria" },
  { id: "protecao", titulo: "Proteção das informações exibidas" },
  { id: "presenca", titulo: "Presença e comunicação interna" },
  { id: "email", titulo: "Comunicações por e-mail" },
  { id: "lgpd", titulo: "Tratamento de dados pessoais (LGPD)" },
  { id: "aceite", titulo: "Aceite eletrônico e novas versões" },
] as const;
const IDS_CLAUSULAS: readonly string[] = CLAUSULAS_AUTO.map((c) => c.id);

const inteiro = (v: unknown, min: number, max: number, padrao: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : padrao;
};
// biome-ignore lint/suspicious/noControlCharactersInRegex: tirar os caracteres de controle é o objetivo
const texto = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "");

/** Qualquer JSON → a configuração válida (o que não vale volta ao padrão — nunca derruba). */
export function lerConfigAcessoConta(v: unknown): ConfigAcessoConta {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const modo = (MODOS_IMPLANTACAO as readonly string[]).includes(o.modo as string) ? (o.modo as ModoImplantacao) : "desligado";
  const ids = (v: unknown, max: number) => (Array.isArray(v) ? [...new Set(v.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, max) : []);
  const testadores = ids(o.testadores, MAX_TESTADORES);
  const porPapel: Record<string, number> = {};
  if (o.porPapel && typeof o.porPapel === "object") {
    for (const [k, val] of Object.entries(o.porPapel as Record<string, unknown>)) {
      if (!/^\d+$/.test(k)) continue;
      const n = Number(val);
      if (Number.isInteger(n) && n >= LIMITE_MIN && n <= LIMITE_MAX) porPapel[k] = n;
    }
  }
  const enc = o.encarregado && typeof o.encarregado === "object" ? (o.encarregado as Record<string, unknown>) : {};
  return {
    modo,
    testadores,
    alcance: o.alcance === "escolhidos" ? "escolhidos" : "todos",
    exigidos: ids(o.exigidos, MAX_EXIGIDOS),
    repetirAoEntrar: o.repetirAoEntrar === true,
    limite: inteiro(o.limite, LIMITE_MIN, LIMITE_MAX, ACESSO_CONTA_PADRAO.limite),
    porPapel,
    trocaDias: inteiro(o.trocaDias, 0, TROCA_MAX_DIAS, ACESSO_CONTA_PADRAO.trocaDias),
    isentarAdm: typeof o.isentarAdm === "boolean" ? o.isentarAdm : true,
    fecharAceiteS: (OPCOES_FECHAR_ACEITE as readonly number[]).includes(Number(o.fecharAceiteS)) ? Number(o.fecharAceiteS) : ACESSO_CONTA_PADRAO.fecharAceiteS,
    telaAceito: o.telaAceito !== false,
    baixarComprovante: o.baixarComprovante !== false,
    encarregado: { nome: texto(enc.nome, 120), email: texto(enc.email, 160), telefone: texto(enc.telefone, 40) },
    clausulasOff: Array.isArray(o.clausulasOff) ? [...new Set(o.clausulasOff.filter((x): x is string => typeof x === "string" && IDS_CLAUSULAS.includes(x)))] : [],
  };
}

export type PessoaRegra = { id: number; admin: boolean };

/** As regras novas (termo e aparelhos) valem para a pessoa? O ÚNICO ponto que decide — layout, guardas, login, cadastro. */
export function regrasValemPara(cfg: ConfigAcessoConta, u: PessoaRegra): boolean {
  if (cfg.modo === "ativo") return cfg.alcance === "todos" || cfg.exigidos.includes(u.id) || cfg.testadores.includes(u.id);
  return cfg.modo === "teste" && cfg.testadores.includes(u.id);
}

/** As pessoas a quem as regras valem (null = todas) — o público das pendências ao ativar, ao trocar a lista e ao publicar. */
export function pessoasDasRegras(cfg: ConfigAcessoConta): number[] | null {
  if (cfg.modo === "desligado") return [];
  if (cfg.modo === "teste") return cfg.testadores;
  return cfg.alcance === "todos" ? null : [...new Set([...cfg.exigidos, ...cfg.testadores])];
}

/** Pessoa em teste com "repetir a cada login". */
export function repeteAoEntrar(cfg: ConfigAcessoConta, u: PessoaRegra): boolean {
  return cfg.modo === "teste" && cfg.repetirAoEntrar && cfg.testadores.includes(u.id);
}

/** O aceite feito agora é de TESTE (não vale como oficial)? */
export const aceiteDeTeste = (cfg: ConfigAcessoConta) => cfg.modo === "teste";

/** O limite de aparelhos vale para a pessoa? (O ADM isento fica de fora — menos quando está no teste.) */
export function aparelhosValemPara(cfg: ConfigAcessoConta, u: PessoaRegra): boolean {
  return regrasValemPara(cfg, u);
}

/** O Administrador fora do LIMITE de aparelhos (`isentarAdm`; no teste, o ADM testador segue as regras) — ele nomeia igual. */
export function semLimiteDeAparelhos(cfg: ConfigAcessoConta, u: PessoaRegra): boolean {
  return u.admin && cfg.isentarAdm && cfg.modo !== "teste";
}

/** O limite que vale para o ADM isento (na prática, sem limite). */
export const LIMITE_ISENTO = 1000;

/** O limite efetivo: o da pessoa › o do papel › o padrão. */
export function limiteEfetivo(cfg: ConfigAcessoConta, papelId: number | null, daPessoa: number | null | undefined): number {
  if (Number.isInteger(daPessoa) && (daPessoa as number) >= LIMITE_MIN && (daPessoa as number) <= LIMITE_MAX) return daPessoa as number;
  const doPapel = papelId != null ? cfg.porPapel[String(papelId)] : undefined;
  return doPapel ?? cfg.limite;
}

/** De onde vem o limite da pessoa (o mesmo critério de `limiteEfetivo`). */
export function origemDoLimite(cfg: ConfigAcessoConta, papelId: number | null, daPessoa: number | null | undefined): "pessoa" | "papel" | "padrao" {
  if (Number.isInteger(daPessoa) && (daPessoa as number) >= LIMITE_MIN && (daPessoa as number) <= LIMITE_MAX) return "pessoa";
  return papelId != null && cfg.porPapel[String(papelId)] ? "papel" : "padrao";
}

export const ROTULO_ORIGEM_LIMITE = { pessoa: "Desta pessoa", papel: "Do papel", padrao: "Padrão do sistema" } as const;

/** A trava de troca está valendo? (ISO; vazio = não.) */
export function emTrava(trocaAte: string | null | undefined, agoraMs: number): boolean {
  if (!trocaAte) return false;
  const t = Date.parse(trocaAte);
  return Number.isFinite(t) && t > agoraMs;
}

export type SituacaoNovoAparelho =
  /** Há vaga: nomear e pronto. */
  | { tipo: "livre" }
  /** Sem vaga: escolher um aparelho para trocar. */
  | { tipo: "lotado" }
  /** Troca recente: aparelho novo não entra até a data (mesmo com vaga). */
  | { tipo: "trava"; ate: string };

/**
 * Um aparelho NOVO pode entrar? `total` = os aparelhos já registrados. A trava (depois de uma troca feita pela pessoa)
 * barra QUALQUER aparelho novo até a data — senão "remover agora e entrar depois" escaparia dela. Sem aparelho algum
 * nunca há trava. No teste com "repetir", não há trava.
 */
export function situacaoNovoAparelho(a: { total: number; limite: number; trocaAte: string | null; agoraMs: number; semTrava?: boolean }): SituacaoNovoAparelho {
  if (a.total > 0 && !a.semTrava && emTrava(a.trocaAte, a.agoraMs)) return { tipo: "trava", ate: a.trocaAte as string };
  return a.total < a.limite ? { tipo: "livre" } : { tipo: "lotado" };
}

/** A data em que a trava termina, a partir de agora (0 dias = sem trava → null). */
export function fimDaTrava(agoraMs: number, dias: number): string | null {
  return dias > 0 ? new Date(agoraMs + dias * 86_400_000).toISOString() : null;
}

export const NOME_APARELHO_MIN = 3;
export const NOME_APARELHO_MAX = 40;

const limparNomeAparelho = (nome: string) =>
  nome
    // biome-ignore lint/suspicious/noControlCharactersInRegex: tirar os caracteres de controle é o objetivo
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Por que o nome do aparelho NÃO vale (null = vale) — a MESMA régua na tela e no servidor: obrigatório, 3–40 caracteres,
 * só letras/números/espaço e `- ( ) . / ,`, ao menos 3 letras, sem o mesmo caractere 4 vezes seguidas e sem ser só repetição. */
export function motivoNomeAparelho(nome: unknown): string | null {
  if (typeof nome !== "string" || !limparNomeAparelho(nome)) return "Informe o nome do aparelho (ex.: Notebook do trabalho).";
  const n = limparNomeAparelho(nome);
  if (n.length < NOME_APARELHO_MIN || n.length > NOME_APARELHO_MAX) return `O nome precisa ter de ${NOME_APARELHO_MIN} a ${NOME_APARELHO_MAX} caracteres.`;
  if (!/^[\p{L}\p{N} ().,/-]+$/u.test(n)) return "Use só letras, números, espaço e - ( ) . / ,";
  const letras = n.match(/\p{L}/gu) ?? [];
  if (letras.length < 3) return "O nome precisa ter ao menos 3 letras (ex.: Celular pessoal).";
  if (/(.)\1{3,}/u.test(n.toLowerCase())) return "Não repita o mesmo caractere tantas vezes.";
  if (new Set(letras.map((l) => l.toLowerCase())).size < 2) return "Escreva um nome que identifique o aparelho (ex.: PC da recepção).";
  return null;
}

/** O nome do aparelho, limpo (sem controles/invisíveis, espaços juntos) — `null` = inválido (`motivoNomeAparelho`). */
export function nomeAparelhoValido(nome: unknown): string | null {
  return motivoNomeAparelho(nome) ? null : limparNomeAparelho(nome as string);
}

/** Iniciais públicas de um nome ("Ana Maria Souza" → "A. M. S.") — a verificação pública nunca mostra o nome inteiro. */
export function iniciais(nome: string): string {
  return nome
    .split(/\s+/)
    .filter((p) => p.length > 2 || /^[A-ZÀ-Ý]/.test(p))
    .map((p) => `${p[0].toUpperCase()}.`)
    .slice(0, 5)
    .join(" ");
}

/** O cookie do aparelho (o MESMO do alerta de login suspeito — 32 hex aleatórios, httpOnly, 2 anos). */
export const COOKIE_APARELHO = "pca_aparelho";
export const idAparelhoValido = (v: string | undefined | null): v is string => !!v && /^[0-9a-f]{32}$/.test(v);

/** O hash do aparelho guardado na tabela `aparelhos` (o banco nunca vê o cookie). */
export async function hashDoAparelho(cookieId: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`aparelho:${cookieId}`));
  return [...new Uint8Array(b)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 40);
}

/** O que a sessão exige antes de liberar o sistema (calculado no `getUsuarioAtual`, sem consulta a mais). */
export type PendenciaAcesso = {
  /** O aparelho desta sessão ainda não tem nome. */
  nomearAparelho: boolean;
  /** O termo: em dia · pendente (bloqueia até o aceite, como o aparelho sem nome). */
  termo: EstadoTermo;
  /** O aparelho nomeado da sessão (null = ainda sem nome). */
  aparelhoId: number | null;
};
export const SEM_PENDENCIA: PendenciaAcesso = { nomearAparelho: false, termo: "ok", aparelhoId: null };

/** A pessoa precisa resolver algo ANTES de usar o sistema (o painel mostra o banner; a API responde 403)? */
export function destinoBloqueio(p: PendenciaAcesso): "aparelho" | "termo" | null {
  if (p.nomearAparelho) return "aparelho";
  if (p.termo === "pendente") return "termo";
  return null;
}

export type EstadoTermo = "ok" | "pendente";

/**
 * O termo é OBRIGATÓRIO como o aparelho: qualquer pendência (a versão vigente ainda não aceita) bloqueia o sistema até o
 * aceite — para todos, o Administrador também (`pendencia` = a data da pendência mais antiga; null = nenhuma).
 */
export function estadoTermo(pendencia: string | null | undefined): EstadoTermo {
  return pendencia ? "pendente" : "ok";
}

/**
 * Os CANAIS AO VIVO (`worker.ts` — notificações e presença) com as regras valendo: a sessão sem o aparelho nomeado (quando o
 * limite vale para a pessoa) ou com o termo vencido é RECUSADA — a mesma régua do painel. `cfgJson` = o `acessoConta` do blob.
 */
export function canalRecusado(d: { cfgJson: string | null; id: number; admin: boolean; aparelhoId: number | null; termoPrazo: string | null }): string | null {
  let bruto: unknown = null;
  try {
    bruto = d.cfgJson ? JSON.parse(d.cfgJson) : null;
  } catch {
    bruto = null;
  }
  const cfg = lerConfigAcessoConta(bruto);
  const quem = { id: d.id, admin: d.admin };
  if (!regrasValemPara(cfg, quem)) return null;
  if (aparelhosValemPara(cfg, quem) && d.aparelhoId == null) return "Aparelho sem nome.";
  if (estadoTermo(d.termoPrazo) === "pendente") return "Termo de Uso pendente.";
  return null;
}

/** O aparelho só é o MESMO no navegador em que foi nomeado (o gravado vazio = antigo, vale). */
export function mesmoNavegador(gravado: string | null | undefined, atual: string): boolean {
  return !gravado || gravado === atual;
}
