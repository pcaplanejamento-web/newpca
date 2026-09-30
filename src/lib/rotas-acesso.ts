import type { AcaoPapel, Tela } from "./papeis-core.ts";

/**
 * O MAPA de acesso das rotas da API (`src/app/api/**\/route.ts`): cada método de cada rota com a guarda que ele usa.
 * Módulo PURO — o teste `tests/rotas-acesso.test.ts` percorre as rotas e confere que TODO método está aqui e chama a
 * guarda descrita (a documentação que não mente). Tipos:
 * - `tela`: `exigirAcesso(telas, acao)` no início (as telas do grupo ativo; várias = basta uma);
 * - `recurso`: a tela vem do RECURSO (protocolo num PCA → `pca`, senão `dfd`; o grupo do quadro de tarefas) — a sessão
 *   primeiro e a recusa pela tela do recurso (`chamada` = o que a confere; padrão `recusa(`);
 * - `admin`: `exigirAdmin` (a Administração é só do papel Administrador);
 * - `pessoal`: só a sessão (o que é da própria pessoa);
 * - `publica`/`interna`: sem sessão (login e cadastro, consulta pública, cron com segredo, webhook assinado).
 */
export type Metodo = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export type RegraRota =
  | { tipo: "tela"; telas: readonly Tela[]; acao: AcaoPapel; obs?: string }
  | { tipo: "recurso"; telas: readonly Tela[]; acao: AcaoPapel; chamada?: string; obs?: string }
  | { tipo: "admin"; chamada?: string }
  | { tipo: "pessoal"; obs?: string }
  | { tipo: "publica"; obs: string }
  | { tipo: "interna"; obs: string };

const tela = (telas: Tela | readonly Tela[], acao: AcaoPapel, obs?: string): RegraRota => ({
  tipo: "tela",
  telas: typeof telas === "string" ? [telas] : telas,
  acao,
  obs,
});
const recurso = (telas: Tela | readonly Tela[], acao: AcaoPapel, chamada?: string, obs?: string): RegraRota => ({
  tipo: "recurso",
  telas: typeof telas === "string" ? [telas] : telas,
  acao,
  chamada,
  obs,
});
const ADMIN: RegraRota = { tipo: "admin" };
/** A guarda do ADM num auxiliar do arquivo (`chamada`, que chama `exigirAdmin`). */
const adminVia = (chamada: string): RegraRota => ({ tipo: "admin", chamada });
const pessoal = (obs?: string): RegraRota => ({ tipo: "pessoal", obs });
const publica = (obs: string): RegraRota => ({ tipo: "publica", obs });
const interna = (obs: string): RegraRota => ({ tipo: "interna", obs });

const MESA = ["dfd", "pca"] as const;

/** Rota (caminho relativo a `src/app/api`, sem `/route.ts`) → método → regra. */
export const ROTAS_ACESSO: Record<string, Partial<Record<Metodo, RegraRota>>> = {
  // ── Administração (só o papel Administrador) ────────────────────────────────────────────────────────────
  "admin/aparencia": { GET: ADMIN, PATCH: ADMIN, DELETE: ADMIN },
  "admin/armazenamento": { GET: ADMIN, POST: ADMIN },
  "admin/auditoria": { GET: ADMIN },
  "admin/avaliacao": { GET: ADMIN, PATCH: ADMIN, DELETE: ADMIN },
  "admin/feriados/[id]": { PATCH: adminVia("alvo("), DELETE: adminVia("alvo(") },
  "admin/feriados": { GET: ADMIN, POST: ADMIN },
  "admin/grupos/[id]": { GET: ADMIN, PATCH: ADMIN, DELETE: ADMIN },
  "admin/grupos": { GET: ADMIN, POST: ADMIN },
  "admin/integracoes/metricas": { GET: ADMIN },
  "admin/integracoes": { GET: ADMIN, PATCH: ADMIN, DELETE: ADMIN },
  "admin/integracoes/testar": { POST: ADMIN },
  "admin/integracoes/trello/membros": { GET: ADMIN, PUT: ADMIN },
  "admin/orgaos/[id]/rebaixar": { POST: ADMIN },
  "admin/orgaos/[id]": { PATCH: ADMIN, DELETE: ADMIN },
  "admin/orgaos/[id]/unidade-propria": { POST: ADMIN },
  "admin/orgaos/ordem": { PATCH: ADMIN },
  "admin/orgaos": { GET: ADMIN, POST: ADMIN },
  "admin/pcas/[id]": { PATCH: ADMIN, DELETE: ADMIN },
  "admin/pcas": { POST: ADMIN },
  "admin/permissoes/[id]": { PATCH: ADMIN, DELETE: ADMIN },
  "admin/permissoes": { GET: ADMIN, POST: ADMIN },
  "admin/reparticoes/[id]/promover": { POST: ADMIN },
  "admin/reparticoes/[id]": { PATCH: ADMIN, DELETE: ADMIN },
  "admin/reparticoes/ordem": { PATCH: ADMIN },
  "admin/reparticoes": { GET: ADMIN, POST: ADMIN },
  "admin/situacoes/[id]": { PATCH: ADMIN, DELETE: ADMIN },
  "admin/situacoes/ordem": { PATCH: ADMIN },
  "admin/situacoes": { GET: ADMIN, POST: ADMIN },
  "admin/usuarios/[id]": { PATCH: ADMIN, DELETE: ADMIN },
  "admin/usuarios": { GET: ADMIN },

  // ── Acesso (sem sessão) ─────────────────────────────────────────────────────────────────────────────────
  "auth/cadastro": { POST: publica("criar a conta (código do e-mail)") },
  "auth/codigo": { POST: publica("enviar o código de confirmação (captcha)") },
  "auth/google/callback": { GET: publica("retorno do Google") },
  "auth/google": { GET: publica("ir ao Google") },
  "auth/login": { POST: publica("entrar") },
  "auth/logout": { POST: publica("sair (encerra a sessão do cookie)") },
  "auth/me": { GET: publica("quem está logado (ou 401)") },
  "auth/senha": { POST: publica("esqueci a senha (código do e-mail)") },

  // ── Catálogo ────────────────────────────────────────────────────────────────────────────────────────────
  "catalogo/[id]": { PATCH: tela("catalogo", "manipular"), DELETE: tela("catalogo", "excluir") },
  "catalogo/classificacoes/[id]": { PATCH: tela("catalogo", "configurar"), DELETE: tela("catalogo", "configurar") },
  "catalogo/classificacoes/itens": { GET: tela("catalogo", "visualizar") },
  "catalogo/classificacoes/ordem": { PATCH: tela("catalogo", "configurar") },
  "catalogo/classificacoes": { GET: tela("catalogo", "visualizar"), POST: tela("catalogo", "configurar") },
  "catalogo/compartilhar": { POST: tela("catalogo", "importar") },
  "catalogo/conferir": { POST: tela(["dfd", "pca", "catalogo"], "visualizar", "a conformidade dos itens de um DFD") },
  "catalogo/item/[id]": {
    PATCH: tela("catalogo", "manipular"),
    DELETE: recurso("catalogo", "excluir", "recusa(", "tirar de um catálogo = Manipular; excluir o item = Excluir"),
  },
  "catalogo/item": { POST: tela("catalogo", "manipular") },
  "catalogo/itens": { PATCH: tela("catalogo", "manipular") },
  "catalogo": { POST: recurso("catalogo", "importar", "recusa(", "criar à mão = Manipular; importar = Importar (+ Excluir ao substituir)") },
  "catalogo/unidades-medida/[id]": { PATCH: tela("catalogo", "configurar"), DELETE: tela("catalogo", "configurar") },
  "catalogo/unidades-medida/ordem": { PATCH: tela("catalogo", "configurar") },
  "catalogo/unidades-medida": { GET: tela("catalogo", "visualizar"), POST: tela("catalogo", "configurar") },
  "catalogo/unidades-medida/sinonimos": { POST: tela("catalogo", "configurar") },
  "catalogo/verificar": { POST: tela("catalogo", "importar") },

  // ── Orçamento ───────────────────────────────────────────────────────────────────────────────────────────
  "orcamento": { POST: tela("orcamento", "importar", "importar o CUBO (em lotes)") },
  "orcamento/[id]": {
    PATCH: tela("orcamento", "configurar", "nome e ano"),
    DELETE: recurso("orcamento", "excluir", "recusa(", "o desfazer da própria importação (última hora) = Importar"),
  },
  "orcamento/[id]/substituir": { POST: tela("orcamento", "importar", "reenviar a planilha") },
  "orcamento/vinculos": { PUT: tela("orcamento", "configurar") },
  "orcamento/visoes": { POST: tela("orcamento", "configurar") },
  "orcamento/visoes/[id]": { PATCH: tela("orcamento", "configurar"), DELETE: tela("orcamento", "configurar") },

  // ── PCA ─────────────────────────────────────────────────────────────────────────────────────────────────
  "pca": { POST: tela("pca", "configurar", "criar o PCA (e a edição legada que une DFDs)") },
  "pca/[id]": {
    PATCH: tela("pca", "configurar", "nome, ano, fonte, publicar, capa, visão, marcados"),
    DELETE: tela("pca", "excluir", "devolve os protocolos à Mesa e desfaz as incorporações"),
  },
  "pca/[id]/capa": { GET: tela("pca", "visualizar") },
  "pca/[id]/itens": { POST: tela("pca", "excluir", "retirar itens do PCA") },
  "pca/[id]/planilhas/[unidadeId]": { DELETE: tela("pca", "excluir") },
  "pca/[id]/protocolos": { POST: tela("pca", "manipular", "enviar também exige Manipular na Mesa (recusa)") },
  "pca/[id]/consulta/dfd/[dfdId]": { GET: publica("PCA publicado; em Preview, quem visualiza o PCA") },
  "pca/[id]/consulta/historico": { GET: publica("PCA publicado; em Preview, quem visualiza o PCA") },
  "pca/[id]/consulta/protocolo/[protocoloId]": { GET: publica("PCA publicado; em Preview, quem visualiza o PCA") },
  "upload": { POST: tela("pca", "importar", "as planilhas de um PCA de lista") },

  // ── Pessoais (qualquer pessoa logada) ───────────────────────────────────────────────────────────────────
  "dados/versao": { GET: pessoal("a versão dos dados (sincronização)") },
  "grupos/ativo": { POST: pessoal("o grupo ativo do cabeçalho (entre os da pessoa)") },
  "reparticoes/ativo": { POST: pessoal("a unidade ativa do cabeçalho (entre as do grupo)") },
  "pca/filtro": { POST: pessoal("o PCA do cabeçalho") },
  "perfil/google": { DELETE: pessoal() },
  "perfil/preferencias": { PATCH: pessoal() },
  "perfil": { PATCH: pessoal() },
  "perfil/senha": { POST: pessoal() },
  "preferencias/tabela": { PUT: pessoal(), DELETE: pessoal() },
  "usuarios/[id]/foto": { GET: pessoal("a foto (avatar) de uma pessoa") },
  "notificacoes": { GET: pessoal("o sino (derivados só dos grupos com Tarefas/Calendário)"), PATCH: pessoal() },

  // ── Internas (sem sessão, com segredo/assinatura) ───────────────────────────────────────────────────────
  "integracoes/email/cron": { POST: interna("cron dos e-mails (cabeçalho secreto)") },
  "integracoes/trello/cron": { POST: interna("cron do Trello (cabeçalho secreto)") },
  "integracoes/trello/webhook/[token]": { POST: interna("aviso do Trello (HMAC)") },
};

/**
 * PREFIXOS de rotas ainda na guarda antiga (`exigirEditor`/`exigirUsuario`) — migradas módulo a módulo; o teste as pula
 * enquanto não estão no mapa. Tem de ZERAR.
 */
export const PENDENTES: readonly string[] = [
  "calendario/",
  "dfd",
  "integracoes/trello/boards",
  "mesa/",
  "protocolo",
  "tabela/",
  "tarefas",
];

export { MESA };
