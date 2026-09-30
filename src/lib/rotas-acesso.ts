import type { AcaoPapel, Tela } from "./papeis-core.ts";

/**
 * O MAPA de acesso das rotas da API (`src/app/api/**\/route.ts`): cada método de cada rota com a guarda que ele usa.
 * Módulo PURO — o teste `tests/rotas-acesso.test.ts` percorre as rotas e confere que TODO método está aqui e chama a
 * guarda descrita (a documentação que não mente). Tipos:
 * - `tela`: `exigirAcesso(telas, acao)` no início (as telas do grupo ativo; várias = basta uma);
 * - `recurso`: a tela vem do RECURSO (protocolo num PCA → `pca`, senão `dfd`; o grupo do quadro de tarefas; a tabela de
 *   uma edição salva) — a sessão primeiro e a recusa pela tela do recurso (`chamada` = o que a confere, padrão `recusa(` —
 *   pode ser um auxiliar do arquivo; `acaoDe` = a ação vem de uma regra PURA, testada no núcleo);
 * - `admin`: `exigirAdmin` (a Administração é só do papel Administrador);
 * - `pessoal`: só a sessão (o que é da própria pessoa);
 * - `publica`/`interna`: sem sessão (login e cadastro, consulta pública, cron com segredo, webhook assinado).
 *
 * `visao` (Mesa) = a rota lê o ESCOPO DA MESA da requisição (`escopoMesa(` — as unidades, as LINHAS "só os meus" e o que o
 * papel vê); o teste confere que ela o chama e que nenhuma rota da Mesa usa o escopo de unidades por fora dele.
 */
export type Metodo = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export type RegraRota =
  | { tipo: "tela"; telas: readonly Tela[]; acao: AcaoPapel; obs?: string; visao?: true }
  | { tipo: "recurso"; telas: readonly Tela[]; acao: AcaoPapel; chamada?: string; acaoDe?: string; obs?: string; visao?: true }
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
const recurso = (telas: Tela | readonly Tela[], acao: AcaoPapel, chamada?: string, obs?: string, acaoDe?: string): RegraRota => ({
  tipo: "recurso",
  telas: typeof telas === "string" ? [telas] : telas,
  acao,
  chamada,
  acaoDe,
  obs,
});
/** A regra de uma rota da MESA que lê o escopo da requisição (`escopoMesa(`): unidades + linhas + o que o papel vê. */
const naMesa = (r: RegraRota): RegraRota => (r.tipo === "tela" || r.tipo === "recurso" ? { ...r, visao: true } : r);
const ADMIN: RegraRota = { tipo: "admin" };
/** A guarda do ADM num auxiliar do arquivo (`chamada`, que chama `exigirAdmin`). */
const adminVia = (chamada: string): RegraRota => ({ tipo: "admin", chamada });
const pessoal = (obs?: string): RegraRota => ({ tipo: "pessoal", obs });
const publica = (obs: string): RegraRota => ({ tipo: "publica", obs });
const interna = (obs: string): RegraRota => ({ tipo: "interna", obs });

const MESA = ["dfd", "pca"] as const;
/** As tarefas e os eventos de um quadro: o papel no GRUPO DO QUADRO em Tarefas — ou no Calendário (ver, mexer, excluir). */
const AGENDA = ["tarefas", "calendario"] as const;
/** A recusa nas tarefas de um quadro, pelo papel no grupo dele. */
const QUADRO = "recusaNoQuadro(";
/** As telas das tabelas com EDIÇÕES SALVAS (a Mesa do sistema e a do PCA, o Comparativo do orçamento, a Lista de tarefas). */
const TABELAS = ["dfd", "pca", "orcamento", "tarefas"] as const;

/** Rota (caminho relativo a `src/app/api`, sem `/route.ts`) → método → regra. */
export const ROTAS_ACESSO: Record<string, Partial<Record<Metodo, RegraRota>>> = {
  // ── Administração (só o papel Administrador) ────────────────────────────────────────────────────────────
  "admin/aparencia": { GET: ADMIN, PATCH: ADMIN, DELETE: ADMIN },
  "admin/armazenamento": { GET: ADMIN, POST: ADMIN },
  "admin/auditoria": { GET: ADMIN },
  "admin/avaliacao": { GET: ADMIN, PATCH: ADMIN, DELETE: ADMIN },
  "admin/cargos/[id]": { PATCH: ADMIN, DELETE: ADMIN },
  "admin/cargos/ordem": { PATCH: ADMIN },
  "admin/cargos": { GET: ADMIN, POST: ADMIN },
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
  "admin/papeis/[id]": { PATCH: ADMIN, DELETE: ADMIN },
  "admin/papeis": { GET: ADMIN, POST: ADMIN },
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
  "auth/desafio": { POST: publica("o desafio da verificação anti-robô própria (limite por IP)") },
  "auth/google/callback": { GET: publica("retorno do Google") },
  "auth/google": { GET: publica("ir ao Google") },
  "auth/login": { POST: publica("entrar") },
  "auth/logout": { POST: publica("sair (encerra a sessão do cookie)") },
  "auth/me": { GET: publica("quem está logado (ou 401)") },
  "auth/senha": { POST: publica("esqueci a senha (código do e-mail)") },

  // ── Calendário (o grupo ativo) ────────────────────────────────────────────────────────────────────────────
  "calendario/assinatura": { POST: tela("calendario", "exportar", "gerar o link de assinatura (.ics)"), DELETE: pessoal("revogar o próprio link") },
  "calendario/busca": { GET: tela("calendario", "visualizar") },
  "calendario/externos": { GET: tela("calendario", "visualizar"), POST: tela("calendario", "importar", "assinar uma agenda externa") },
  "calendario/externos/[id]": {
    PATCH: recurso("calendario", "importar", "daPessoa(", "só a da própria pessoa"),
    DELETE: recurso("calendario", "visualizar", "daPessoa(", "tirar a própria agenda"),
  },
  "calendario/ics/[token]": { GET: publica("o feed .ics pelo token: pessoa ativa, Exportar no Calendário e só os quadros dos grupos que o abrem") },

  // ── Catálogo ────────────────────────────────────────────────────────────────────────────────────────────
  "catalogo/[id]": {
    PATCH: tela("catalogo", "manipular"),
    DELETE: recurso("catalogo", "excluir", "recusa(", "o desfazer da própria importação (última hora) = Importar"),
  },
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

  // ── Mesa (a tela do RECURSO: protocolo num PCA → `pca`, senão `dfd`; LER = uma das duas Mesas + o escopo de unidades)
  // (todas pelo ESCOPO DA MESA — `naMesa`: as unidades, as linhas "só os meus" e o que o papel vê).
  "dfd": { POST: naMesa(recurso(MESA, "importar", "recusa(", "a Mesa de destino: a do protocolo; sem ele, a do DFD existente (novo avulso = sistema)")) },
  "dfd/[id]": {
    GET: naMesa(tela(MESA, "visualizar", "a unidade do DFD ou a do protocolo dele no escopo")),
    PATCH: naMesa(recurso(MESA, "manipular", "recusa(", "vincular: também Manipular na Mesa do protocolo de destino")),
    DELETE: naMesa(recurso(MESA, "excluir", "recusa(", "desfazer = Importar (só a gravação parcial própria); reenvio = Importar + Excluir")),
  },
  "dfd/[id]/historico": { GET: naMesa(tela(MESA, "visualizar")) },
  "dfd/conferencia": { POST: naMesa(tela(MESA, "visualizar")) },
  "dfd/existentes": { POST: naMesa(tela(MESA, "importar")) },
  "dfd/itens": { GET: naMesa(recurso(MESA, "visualizar", "recusa(", "?pca= → a Mesa do PCA; senão a do sistema")) },
  "dfd/itens/massa": { POST: naMesa(recurso(MESA, "manipular", "motivoRecusa(", "por DFD — o que o papel não permite vira falha")) },
  "dfd/massa": { POST: naMesa(recurso(MESA, "manipular", "motivoRecusa(", "por DFD — o que o papel não permite vira falha")) },
  "mesa/execucao": { GET: naMesa(tela("dfd", "visualizar", "o Dashboard da Mesa do sistema (sem o desempenho por pessoa: só as correções, sem pessoas)")) },
  "protocolo": { POST: naMesa(recurso(MESA, "importar", "recusa(", "novo = Mesa do sistema; reenvio/mesmo nº = a Mesa em que ele está")) },
  "protocolo/[id]": {
    GET: naMesa(tela(MESA, "visualizar")),
    PATCH: naMesa(recurso(MESA, "manipular", "recusa(", "capa, unidade, situação e o responsável (no nível do papel)")),
    DELETE: naMesa(recurso(MESA, "excluir", "recusa(", "em cascata com os DFDs; num PCA, não se exclui")),
  },
  "protocolo/[id]/historico": { GET: naMesa(tela(MESA, "visualizar")) },
  "protocolo/conferencia": { POST: naMesa(tela(MESA, "visualizar")) },
  "protocolo/massa": { POST: naMesa(recurso(MESA, "manipular", "motivoRecusa(", "por protocolo — o que o papel não permite vira falha")) },

  // ── Integrações (sessão) ─────────────────────────────────────────────────────────────────────────────────
  "integracoes/trello/boards": {
    GET: recurso("tarefas", "configurar", "podeLigarTrello(", "?quadro= — os boards da conta: quem liga ESTE quadro (o privado, só o dono)", "podeLigarTrello("),
  },

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
  "pca/[id]/itens": { POST: naMesa(tela("pca", "excluir", "retirar itens do PCA")) },
  "pca/[id]/planilhas/[unidadeId]": { DELETE: tela("pca", "excluir") },
  "pca/[id]/protocolos": { POST: naMesa(tela("pca", "manipular", "enviar também exige Manipular na Mesa (recusa)")) },
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

  // ── Edições salvas de tabela (a tela da tabela da chave: salvar a sua = Visualizar; publicar/moderar = Configurar) ──
  "tabela/edicoes": { POST: recurso(TABELAS, "visualizar", "recusaNaChave(", "pública = Configurar; chave de outra tabela = 422") },
  "tabela/edicoes/[id]": {
    PATCH: recurso(TABELAS, "visualizar", "paraGravar(", "o dono (publicar = Configurar); a pública de outra pessoa = Configurar; a privada, só o ADM", "acaoParaGravar("),
    DELETE: recurso(TABELAS, "visualizar", "paraGravar(", "o dono exclui a sua sempre; a pública de outra pessoa = Configurar", "acaoParaGravar("),
  },

  // ── Tarefas (o papel no GRUPO DO QUADRO — o link de um aviso de outro grupo segue valendo; a tarefa e os eventos
  //    também pelo Calendário) ─────────────────────────────────────────────────────────────────────────────────
  "tarefas": { POST: recurso(AGENDA, "manipular", QUADRO, "criar a tarefa na lista") },
  "tarefas/[id]": { GET: recurso(AGENDA, "visualizar", QUADRO), PATCH: recurso(AGENDA, "manipular", QUADRO), DELETE: recurso(AGENDA, "excluir", QUADRO) },
  "tarefas/[id]/checklist": { POST: recurso(AGENDA, "manipular", QUADRO) },
  "tarefas/[id]/checklist/[itemId]": {
    PATCH: recurso(AGENDA, "manipular", "itemDaTarefa("),
    DELETE: recurso(AGENDA, "manipular", "itemDaTarefa(", "tirar um item é mexer na tarefa"),
  },
  "tarefas/[id]/checklist/[itemId]/converter": { POST: recurso(AGENDA, "manipular", QUADRO) },
  "tarefas/[id]/checklists": { POST: recurso(AGENDA, "manipular", QUADRO) },
  "tarefas/[id]/comentarios": { POST: recurso(AGENDA, "manipular", QUADRO) },
  "tarefas/[id]/comentarios/[cid]": {
    PATCH: recurso(AGENDA, "manipular", "comentario(", "só o próprio comentário"),
    DELETE: recurso(AGENDA, "manipular", "comentario(", "o próprio = Manipular; o de outra pessoa = Excluir"),
  },
  "tarefas/[id]/copiar": { POST: recurso(AGENDA, "manipular", QUADRO, "Visualizar a origem + Manipular no quadro de destino") },
  "tarefas/[id]/eventos": { POST: recurso(AGENDA, "manipular", QUADRO) },
  "tarefas/[id]/historico": { GET: recurso(AGENDA, "visualizar", QUADRO) },
  "tarefas/[id]/mover": { POST: recurso(AGENDA, "manipular", QUADRO) },
  "tarefas/[id]/mover-quadro": { POST: recurso(AGENDA, "manipular", QUADRO, "Manipular nos dois quadros") },
  "tarefas/automacoes/[id]": { PATCH: recurso("tarefas", "configurar", "automacaoDoEditor("), DELETE: recurso("tarefas", "configurar", "automacaoDoEditor(") },
  "tarefas/campos/[id]": { PATCH: recurso("tarefas", "configurar", "campoDoEditor("), DELETE: recurso("tarefas", "configurar", "campoDoEditor(") },
  "tarefas/checklists/[id]": { PATCH: recurso(AGENDA, "manipular", "checklistAcessivel("), DELETE: recurso(AGENDA, "manipular", "checklistAcessivel(") },
  "tarefas/destinos": { GET: recurso(AGENDA, "manipular", "gruposDeTarefas(", "os quadros em que se copia/move uma tarefa") },
  "tarefas/do-vinculo": { GET: recurso(AGENDA, "visualizar", "gruposDeTarefas(", "as tarefas do alvo; os quadros para criar = Manipular") },
  "tarefas/equipes/[id]": { PATCH: recurso("tarefas", "configurar", "equipeDoEditor("), DELETE: recurso("tarefas", "configurar", "equipeDoEditor(") },
  "tarefas/etiquetas/[id]": { PATCH: recurso("tarefas", "configurar", "etiquetaDoEditor("), DELETE: recurso("tarefas", "configurar", "etiquetaDoEditor(") },
  "tarefas/eventos/[id]": {
    PATCH: recurso(AGENDA, "manipular", "eventoAcessivel(", "o PRIVADO, só quem participa (também para o ADM)"),
    DELETE: recurso(AGENDA, "manipular", "eventoAcessivel(", "o PRIVADO, só quem participa (também para o ADM)"),
  },
  "tarefas/eventos/[id]/resposta": { POST: recurso(AGENDA, "visualizar", QUADRO, "só o convidado responde") },
  "tarefas/fotos": { GET: recurso("tarefas", "configurar", "gruposDeTarefas(", "as fotos de fundo: quem configura quadros em algum grupo") },
  "tarefas/listas/[id]": {
    GET: recurso("tarefas", "visualizar", QUADRO, "quantos cartões (excluir a lista)"),
    PATCH: recurso("tarefas", "configurar", "listaDoEditor("),
    DELETE: recurso("tarefas", "excluir", "listaDoEditor("),
  },
  "tarefas/listas/[id]/ordenar": { POST: recurso("tarefas", "manipular", QUADRO, "ordenar os cartões da lista") },
  "tarefas/massa": { POST: recurso(AGENDA, "manipular", QUADRO) },
  "tarefas/modelos": { POST: recurso("tarefas", "configurar", QUADRO, "salvar o quadro como modelo") },
  "tarefas/modelos/[id]": { DELETE: recurso("tarefas", "configurar", QUADRO, "quem salvou = Manipular; os demais = Configurar") },
  "tarefas/pastas": { POST: recurso("tarefas", "configurar", QUADRO, "a pública = Configurar no grupo; a privada = Manipular (do dono)") },
  "tarefas/pastas/[id]": {
    PATCH: recurso("tarefas", "configurar", "pastaOrganizavel(", "a pública = Configurar; a privada = o dono com Manipular", "atorPasta("),
    DELETE: recurso("tarefas", "configurar", "pastaOrganizavel(", "a pública = Configurar; a privada = o dono com Manipular", "atorPasta("),
  },
  "tarefas/pastas/mover": { POST: recurso("tarefas", "configurar", "atorPasta(", "a regra pura das pastas (origem e destino)", "atorPasta(") },
  "tarefas/quadros": {
    GET: recurso("tarefas", "visualizar", "gruposDeTarefas(", "os quadros dos grupos em que o papel vê Tarefas"),
    POST: tela("tarefas", "configurar", "criar o quadro no grupo ativo (copiar templates: Visualizar no quadro de origem)"),
  },
  "tarefas/quadros/[id]": { PATCH: recurso("tarefas", "configurar", QUADRO, "o privado: só o dono o torna privado/público"), DELETE: recurso("tarefas", "excluir", QUADRO) },
  "tarefas/quadros/[id]/automacoes": { POST: recurso("tarefas", "configurar", QUADRO) },
  "tarefas/quadros/[id]/campos": { POST: recurso("tarefas", "configurar", "quadroDoEditor("), PATCH: recurso("tarefas", "configurar", "quadroDoEditor(") },
  "tarefas/quadros/[id]/equipes": { POST: recurso("tarefas", "configurar", QUADRO) },
  "tarefas/quadros/[id]/etiquetas": { POST: recurso("tarefas", "configurar", QUADRO) },
  "tarefas/quadros/[id]/importar": { POST: recurso("tarefas", "importar", QUADRO, "importar do Trello (.json)") },
  "tarefas/quadros/[id]/listas": {
    POST: recurso("tarefas", "manipular", QUADRO, "limite, lista de concluídas e posição = Configurar"),
    PATCH: recurso("tarefas", "configurar", "quadroDoEditor(", "a ordem das listas"),
  },
  "tarefas/quadros/[id]/listas/periodo": { POST: recurso("tarefas", "configurar", QUADRO) },
  "tarefas/quadros/[id]/trello": {
    GET: recurso("tarefas", "visualizar", "quadroDoEditor(", "o estado da ligação"),
    POST: recurso("tarefas", "configurar", "quadroDoEditor(", "ligar/sincronizar: o privado, só o dono", "podeLigarTrello("),
  },
  "tarefas/vinculos": { GET: recurso(["dfd", "pca", "orcamento", "tarefas"], "visualizar", "podeTela(", "a busca na tela do alvo (tarefas: os quadros que o papel vê)") },

  // ── Internas (sem sessão, com segredo/assinatura) ───────────────────────────────────────────────────────
  "integracoes/email/cron": { POST: interna("cron dos e-mails (cabeçalho secreto)") },
  "integracoes/trello/cron": { POST: interna("cron do Trello (cabeçalho secreto)") },
  "integracoes/trello/webhook/[token]": { POST: interna("aviso do Trello (HMAC)") },
};

export { MESA };
