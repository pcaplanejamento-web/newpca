// TERMO DE USO — núcleo PURO (testado em tests/termo-aparelhos.test.ts): o modelo inicial, as CLÁUSULAS AUTOMÁTICAS (saem
// das configurações reais do sistema), a montagem do texto final congelado, o hash, o SELO do aceite, o código de
// verificação, o estado do aceite (em dia · carência · bloqueado) e os blocos do comprovante em PDF.

import { type ConfigAcessoConta, OPCOES_TROCA_DIAS } from "./acesso-conta-core.ts";
import type { BlocoDoc } from "./documento-pdf-core.ts";
import { semAlinhamento } from "./texto-formatado.ts";

/** Teto do texto do ADM e do texto final (o leitor formatado lê até 20 mil caracteres por bloco; o final é lido por partes). */
export const MAX_TEXTO_ADM = 40_000;

/** O que o sistema sabe de si para escrever as cláusulas automáticas. */
export type ContextoClausulas = {
  nomeSistema: string;
  acesso: ConfigAcessoConta;
  /** Minutos sem atividade até encerrar a sessão (0 = não encerra). */
  inatividadeMin: number;
  protecao: { ligada: boolean; copia: boolean; impressao: boolean; ocultar: boolean; marcaDagua: boolean };
  presenca: boolean;
  chat: boolean;
  email: boolean;
  google: boolean;
};

export type Clausula = { id: string; titulo: string; texto: string };

const dias = (n: number) => (n === 1 ? "1 (um) dia" : `${n} dias`);

/**
 * As cláusulas AUTOMÁTICAS — geradas das configurações do momento da publicação (o ADM não as edita; mudou a
 * configuração, a tela do ADM avisa que o termo publicado ficou desatualizado). Ordem estável.
 */
export function clausulasAutomaticas(c: ContextoClausulas): Clausula[] {
  const a = c.acesso;
  const out: Clausula[] = [];
  const limitePapel = Object.keys(a.porPapel).length > 0;
  out.push({
    id: "aparelhos",
    titulo: "Aparelhos vinculados à conta",
    texto: [
      `Cada conta pode ter, ao mesmo tempo, no máximo ${a.limite} ${a.limite === 1 ? "aparelho vinculado" : "aparelhos vinculados"} (computador, notebook, tablet ou celular, identificado pelo navegador utilizado)${limitePapel ? ", podendo o Administrador definir limite diferente para determinados papéis ou usuários" : ""}.`,
      "Ao acessar o sistema pela primeira vez, ou a partir de um aparelho ainda não reconhecido, o usuário deverá dar um nome a esse aparelho para liberar o acesso. Atingido o limite, só será possível usar um aparelho novo retirando um dos aparelhos já vinculados, o que encerra as sessões abertas naquele aparelho.",
      a.trocaDias > 0
        ? `Depois de trocar um aparelho, o usuário não poderá vincular outro aparelho novo pelo prazo de ${dias(a.trocaDias)}, salvo liberação expressa do Administrador, mediante solicitação justificada.`
        : "A troca de aparelhos não tem prazo de carência, respeitado o limite de aparelhos da conta.",
      "Limpar os dados do navegador, usar navegação anônima ou outro navegador faz o aparelho ser tratado como novo. O usuário é responsável por manter apenas aparelhos sob seu controle vinculados à conta e por retirar, no Perfil, o aparelho que deixar de usar.",
    ].join("\n\n"),
  });
  out.push({
    id: "sessao",
    titulo: "Sessão e credenciais",
    texto: [
      `O acesso é pessoal e intransferível, feito com o e-mail institucional e a senha do usuário${c.google ? " ou com a conta Google vinculada no Perfil" : ""}. É vedado compartilhar a senha, emprestar a conta ou permitir que terceiros operem o sistema em seu nome.`,
      c.inatividadeMin > 0
        ? `A sessão é encerrada automaticamente após ${c.inatividadeMin < 60 ? `${c.inatividadeMin} minutos` : `${c.inatividadeMin / 60} hora(s)`} sem atividade, exigindo novo login.`
        : "A sessão expira periodicamente, exigindo novo login.",
      "O sistema aplica verificação anti-robô e limite de tentativas no login e no cadastro, e pode bloquear temporariamente a conta após tentativas de senha incorretas.",
    ].join("\n\n"),
  });
  out.push({
    id: "registros",
    titulo: "Registros de acesso e auditoria",
    texto:
      "Para segurança e prestação de contas, o sistema registra os acessos (data e hora, navegador, endereço IP e aparelho) e mantém histórico permanente das inclusões, alterações e exclusões de dados, com a identificação de quem as realizou. Os registros podem ser consultados pelo Administrador e utilizados em apurações administrativas, auditorias e pelos órgãos de controle. O próprio usuário pode consultar o seu histórico de acesso no Perfil.",
  });
  if (c.protecao.ligada) {
    const medidas: string[] = [];
    if (c.protecao.copia) medidas.push("bloqueio de seleção e cópia do conteúdo das telas");
    if (c.protecao.impressao) medidas.push("bloqueio de impressão e de captura da tela");
    if (c.protecao.ocultar) medidas.push("ocultação do conteúdo quando a janela perde o foco");
    if (c.protecao.marcaDagua) medidas.push("marca d'água com a identificação de quem visualiza (nome, matrícula, data e hora)");
    out.push({
      id: "protecao",
      titulo: "Proteção das informações exibidas",
      texto: `Para proteger as informações do Município, o sistema aplica, conforme definido pela Administração: ${medidas.join("; ") || "medidas de proteção das telas"}. É vedado reproduzir, fotografar, divulgar ou extrair informações do sistema fora das finalidades do serviço; as exportações oficiais (planilhas e PDFs) ficam disponíveis a quem tem essa permissão e também identificam quem as gerou.`,
    });
  }
  if (c.presenca || c.chat) {
    const partes: string[] = [];
    if (c.presenca) partes.push("os membros do mesmo grupo podem ver quando o usuário está online ou ausente e em qual tela do sistema está trabalhando, enquanto ele estiver com o sistema aberto");
    if (c.chat) partes.push("as conversas do chat interno são guardadas por 7 (sete) dias e apagadas automaticamente depois disso, devendo o chat ser utilizado apenas para assuntos de serviço");
    out.push({ id: "presenca", titulo: "Presença e comunicação interna", texto: `${partes.map((p, i) => (i === 0 ? p[0].toUpperCase() + p.slice(1) : p)).join("; ")}.` });
  }
  if (c.email) {
    out.push({
      id: "email",
      titulo: "Comunicações por e-mail",
      texto:
        "O sistema envia ao e-mail institucional do usuário os códigos de confirmação e os avisos do serviço (atribuições, prazos, convites e outros escolhidos pela Administração). O usuário pode ajustar, no Perfil, os avisos que não forem obrigatórios.",
    });
  }
  const enc = a.encarregado;
  const contato = [enc.nome, enc.email, enc.telefone].filter(Boolean).join(" · ");
  out.push({
    id: "lgpd",
    titulo: "Tratamento de dados pessoais (Lei nº 13.709/2018 — LGPD)",
    texto: [
      `O ${c.nomeSistema} trata os dados pessoais do usuário (nome, matrícula, cargo, unidade, e-mail, telefone, foto, registros de acesso e de atividade) exclusivamente para identificar quem opera o sistema, controlar o acesso, garantir a segurança e a rastreabilidade dos atos e cumprir as obrigações legais do planejamento das contratações públicas.`,
      "As bases legais são o cumprimento de obrigação legal ou regulatória e a execução de políticas públicas pela Administração Pública (art. 7º, II e III, e art. 23 da LGPD). Os dados não são vendidos nem compartilhados com terceiros, salvo por determinação legal, com órgãos de controle ou com os operadores necessários ao funcionamento do sistema (hospedagem e envio de e-mails).",
      "Os dados são mantidos enquanto durar o vínculo do usuário com o sistema e, depois, pelo prazo necessário ao cumprimento das obrigações legais e de prestação de contas; os registros de auditoria são permanentes.",
      "O usuário pode solicitar confirmação, acesso, correção de dados incompletos ou desatualizados e demais direitos do art. 18 da LGPD, observadas as limitações legais próprias da Administração Pública.",
      contato
        ? `Encarregado pelo tratamento de dados pessoais: ${contato}.`
        : "As solicitações sobre dados pessoais devem ser dirigidas ao Administrador do sistema.",
    ].join("\n\n"),
  });
  out.push({
    id: "aceite",
    titulo: "Aceite eletrônico e novas versões",
    texto:
      "O aceite deste termo é feito por assinatura eletrônica simples (Lei nº 14.063/2020, art. 4º, I), com a confirmação da identidade do usuário (senha da conta ou código enviado ao e-mail institucional) e o registro da data, hora, endereço IP, navegador e aparelho utilizados, além do resumo criptográfico (SHA-256) do texto aceito. O comprovante pode ser baixado a qualquer momento no Perfil e conferido pelo código de verificação. Sempre que este termo for atualizado, o usuário poderá ser chamado a ler e aceitar a nova versão para continuar utilizando o sistema.",
  });
  return out;
}

/** As opções de dias de trava aceitas (para a tela do ADM). */
export const DIAS_TRAVA = OPCOES_TROCA_DIAS;

/** O MODELO de texto do termo (o ADM começa dele e adapta). Profissional e completo; o que depende da configuração fica nas
 * cláusulas automáticas, ao fim. */
export function modeloTermo(nomeSistema: string, orgao = "Prefeitura Municipal de Rio Verde"): string {
  return `Este Termo de Uso estabelece as condições para utilização do **${nomeSistema}**, sistema de apoio ao Planejamento das Contratações Anual (PCA) e à gestão das demandas de contratação da ${orgao}, de uso exclusivo de agentes públicos e colaboradores autorizados.

## 1. Objeto e aceitação

1.1. Ao criar a conta, ou ao continuar utilizando o sistema após a publicação de nova versão, o usuário declara ter lido, compreendido e aceito integralmente este Termo de Uso.

1.2. O acesso ao sistema depende do aceite deste termo e da aprovação do cadastro pelo Administrador.

## 2. Definições

- **Sistema:** a plataforma ${nomeSistema}, com todas as suas telas, funcionalidades, integrações e documentos gerados.
- **Usuário:** o agente público ou colaborador cadastrado, identificado pelo e-mail institucional e pela matrícula.
- **Administrador:** o responsável designado pela gestão do sistema, dos cadastros, dos acessos e das configurações.
- **Grupo e papel:** o grupo define as telas e as unidades que o usuário acessa; o papel define as ações que ele pode realizar em cada tela.

## 3. Cadastro e veracidade das informações

3.1. O usuário deve informar dados verdadeiros, completos e atualizados, sendo responsável por sua exatidão.

3.2. Nome, e-mail, matrícula, cargo e unidade são mantidos pelo Administrador; o usuário deve comunicar qualquer alteração.

## 4. Uso permitido

4.1. O sistema deve ser utilizado exclusivamente para o exercício das atribuições funcionais do usuário, em conformidade com a Lei nº 14.133/2021, com as normas internas do Município e com os princípios da legalidade, impessoalidade, moralidade, publicidade e eficiência.

4.2. O usuário só deve acessar, incluir, alterar ou excluir informações para as quais tenha competência e permissão.

## 5. Condutas vedadas

É vedado ao usuário:

- compartilhar a senha, emprestar a conta ou acessar o sistema com a conta de outra pessoa;
- inserir informações falsas, incompletas ou que não correspondam aos documentos oficiais;
- tentar burlar os controles de acesso, de segurança ou de auditoria, ou explorar falhas do sistema;
- extrair, copiar ou divulgar informações do sistema para fins alheios ao serviço;
- utilizar o sistema para fins pessoais, políticos, comerciais ou ilícitos.

## 6. Responsabilidades do usuário

6.1. O usuário responde pelos atos praticados com a sua conta e pelas informações que inserir, alterar ou aprovar.

6.2. O usuário deve comunicar imediatamente ao Administrador qualquer suspeita de uso indevido da sua conta, perda de aparelho ou incidente de segurança.

6.3. O descumprimento deste termo pode sujeitar o usuário às sanções administrativas, civis e penais cabíveis, sem prejuízo da suspensão do acesso.

## 7. Sigilo e integridade das informações

7.1. As informações do sistema são de propriedade do Município e devem ser tratadas com sigilo, integridade e cuidado, observadas a Lei de Acesso à Informação (Lei nº 12.527/2011) e a LGPD.

7.2. Os documentos e relatórios gerados pelo sistema têm caráter de apoio à gestão e não substituem os atos e documentos oficiais.

## 8. Disponibilidade e suporte

8.1. O sistema é disponibilizado na forma em que se encontra, podendo passar por manutenções, atualizações e interrupções programadas ou emergenciais.

8.2. Dúvidas e solicitações devem ser encaminhadas ao Administrador do sistema.

## 9. Suspensão e encerramento do acesso

O Administrador pode suspender, desativar ou arquivar a conta em caso de desligamento, mudança de lotação, inatividade, descumprimento deste termo ou por determinação superior, preservados os registros de auditoria.

## 10. Alterações deste termo

Este termo pode ser atualizado a qualquer tempo. Cada versão é identificada por número e data de publicação, e o usuário pode ser chamado a aceitar a nova versão para continuar utilizando o sistema.

## 11. Disposições finais

Os casos omissos serão resolvidos pela Administração, à luz da legislação aplicável. Fica eleito o foro da Comarca de Rio Verde — GO para dirimir questões decorrentes deste termo.`;
}

/** O nome do documento — fixo: cada termo é identificado pela VERSÃO e pela data/hora dela, sem título próprio. */
export const NOME_TERMO = "Termo de Uso";

/** "Termo de Uso — versão 3 · 23/10/2026 14:05" (a data/hora da publicação, em Brasília); sem publicação, "(rascunho)". */
export function rotuloVersaoTermo(versao: number, publicadoEm?: string | null): string {
  return `${NOME_TERMO} — versão ${versao}${publicadoEm ? ` · ${dataHoraCurtaBR(publicadoEm)}` : " (rascunho)"}`;
}

/** "23/10/2026 14:05" (Brasília), sem os segundos. */
function dataHoraCurtaBR(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${dataBR(iso)} ${d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}`;
}

/** O texto FINAL congelado na publicação: a versão com a data/hora, o texto do ADM e as cláusulas automáticas numeradas. */
export function montarTermo(t: { versao: number; publicadoEm: string; textoAdm: string; clausulas: Clausula[] }): string {
  const auto = t.clausulas.map((c, i) => `### A.${i + 1}. ${c.titulo}\n\n${c.texto}`).join("\n\n");
  return [
    `# ${NOME_TERMO}`,
    `Versão ${t.versao} — publicada em ${dataHoraCurtaBR(t.publicadoEm)} (horário de Brasília).`,
    t.textoAdm.trim(),
    t.clausulas.length ? `## Cláusulas definidas pelas configurações do sistema\n\n${auto}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** A data dd/mm/aaaa de Brasília de um ISO. */
export function dataBR(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
export function dataHoraBR(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

async function sha256(texto: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** O hash (SHA-256 hex) do texto — normaliza as quebras de linha (o mesmo texto dá o mesmo hash em qualquer sistema). */
export const hashTexto = (texto: string) => sha256(texto.replace(/\r\n?/g, "\n"));

/** A "impressão digital" das cláusulas automáticas — comparar a publicada com a de agora (termo desatualizado?). */
export const assinaturaClausulas = (c: Clausula[]) => hashTexto(JSON.stringify(c.map((x) => [x.id, x.titulo, x.texto])));

/** Os dados que compõem o SELO de um aceite (a ordem importa — nunca mude, só acrescente no fim). */
export type DadosAceite = {
  codigo: string;
  versao: number;
  hash: string;
  usuarioId: number | null;
  nome: string;
  matricula: string;
  cargo: string;
  unidade: string;
  email: string;
  ip: string;
  navegador: string;
  aparelho: string;
  metodo: string;
  em: string;
  teste: boolean;
};

/** O SELO do aceite: SHA-256 de todos os dados — qualquer alteração no registro quebra o selo (conferido na verificação). */
export function seloAceite(d: DadosAceite): Promise<string> {
  return sha256(
    JSON.stringify([d.codigo, d.versao, d.hash, d.usuarioId, d.nome, d.matricula, d.cargo, d.unidade, d.email, d.ip, d.navegador, d.aparelho, d.metodo, d.em, d.teste ? 1 : 0]),
  );
}

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** O código de verificação (128 bits em base32 legível, sem 0/O/1/I): XXXX-XXXX-…, 26 caracteres. */
export function codigoDeBytes(bytes: Uint8Array): string {
  let bits = 0;
  let acc = 0;
  let out = "";
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALFABETO[(acc >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALFABETO[(acc << (5 - bits)) & 31];
  return out.match(/.{1,4}/g)?.join("-") ?? out;
}
/** O código digitado (sem hífens, maiúsculo) — para conferir o que veio na URL. */
export function codigoNormal(c: string): string | null {
  const s = c.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-HJ-NP-Z2-9]{20,32}$/.test(s) ? (s.match(/.{1,4}/g) ?? []).join("-") : null;
}

export { type EstadoTermo, estadoTermo } from "./acesso-conta-core.ts";

/** O método do aceite por extenso. */
export const ROTULO_METODO: Record<string, string> = {
  senha: "Senha da conta",
  codigo: "Código enviado ao e-mail institucional",
  sessao: "Sessão autenticada + declaração digitada",
};

/** A frase que confirma o aceite quando não há senha nem envio de e-mail. */
export const FRASE_ACEITE = "LI E CONCORDO";
export const fraseConfere = (f: string) => f.trim().toUpperCase().replace(/\s+/g, " ") === FRASE_ACEITE;

/** O texto final em BLOCOS de documento (os títulos markdown viram seções, listas viram listas, o resto parágrafo). */
export function blocosDoTexto(texto: string): BlocoDoc[] {
  const out: BlocoDoc[] = [];
  const limpar = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/(^|\s)[*_](\S.*?)[*_](?=\s|$|[.,;:])/g, "$1$2");
  let par: string[] = [];
  let lista: string[] = [];
  const fechar = () => {
    if (par.length) out.push({ tipo: "paragrafo", texto: limpar(par.join(" ")) });
    if (lista.length) out.push({ tipo: "lista", itens: lista.map(limpar) });
    par = [];
    lista = [];
  };
  for (const l of texto.replace(/\r\n?/g, "\n").split("\n")) {
    const s = semAlinhamento(l.trim());
    if (!s) {
      fechar();
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(s);
    if (h) {
      fechar();
      out.push(h[1].length === 1 ? { tipo: "titulo", texto: limpar(h[2]) } : h[1].length === 2 ? { tipo: "secao", texto: limpar(h[2]) } : { tipo: "subsecao", texto: limpar(h[2]) });
      continue;
    }
    const li = /^(?:[-*•]|\d+[.)])\s+(.*)$/.exec(s);
    if (li && !/^\d+\.\d+\./.test(s)) {
      if (par.length) {
        out.push({ tipo: "paragrafo", texto: limpar(par.join(" ")) });
        par = [];
      }
      lista.push(li[1]);
      continue;
    }
    if (lista.length) {
      out.push({ tipo: "lista", itens: lista.map(limpar) });
      lista = [];
    }
    par.push(s);
  }
  fechar();
  return out;
}

/** O COMPROVANTE em PDF: o termo integral + o registro da assinatura eletrônica. */
export function blocosComprovante(termoTexto: string, a: DadosAceite & { selo: string; urlVerificacao: string }): BlocoDoc[] {
  const blocos: BlocoDoc[] = [];
  if (a.teste) blocos.push({ tipo: "nota", texto: "TESTE — este aceite foi feito na fase de teste e não tem valor como aceite oficial.", cor: "@danger" });
  blocos.push(...blocosDoTexto(termoTexto));
  blocos.push({ tipo: "secao", texto: "Registro de assinatura eletrônica" });
  blocos.push({
    tipo: "paragrafo",
    texto: `Assinado eletronicamente por ${a.nome}${a.matricula ? `, matrícula ${a.matricula}` : ""}${a.cargo ? `, ${a.cargo}` : ""}${a.unidade ? ` (${a.unidade})` : ""}, em ${dataHoraBR(a.em)} (horário de Brasília) — assinatura eletrônica simples, Lei nº 14.063/2020, art. 4º, I.`,
  });
  blocos.push({
    tipo: "tabela",
    colunas: [
      { titulo: "Dado", peso: 1 },
      { titulo: "Registro", peso: 3 },
    ],
    linhas: [
      ["Signatário", a.nome],
      ["Matrícula", a.matricula || "—"],
      ["Cargo / unidade", [a.cargo, a.unidade].filter(Boolean).join(" · ") || "—"],
      ["E-mail", a.email],
      ["Data e hora", `${dataHoraBR(a.em)} (Brasília) · ${a.em}`],
      ["Confirmação da identidade", ROTULO_METODO[a.metodo] ?? a.metodo],
      ["Endereço IP", a.ip || "—"],
      ["Navegador", a.navegador || "—"],
      ["Aparelho", a.aparelho || "—"],
      ["Termo aceito", `Versão ${a.versao}`],
      ["Resumo do texto (SHA-256)", a.hash],
      ["Selo do registro (SHA-256)", a.selo],
      ["Código de verificação", a.codigo],
    ].map(([r, v]) => ({ celulas: [r, v] })),
  });
  blocos.push({ tipo: "nota", texto: `Confira a autenticidade em ${a.urlVerificacao} informando o código ${a.codigo}.`, cor: "@muted" });
  return blocos;
}
