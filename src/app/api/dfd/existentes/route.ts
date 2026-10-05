import { podeTela } from "@/lib/acesso";
import { dfdNasLinhas, type EscopoMesa, escopoMesa, protocoloNasLinhas } from "@/lib/acesso-mesa";
import { exigirAcesso } from "@/lib/api-auth";
import { dfdsPorNumeros } from "@/lib/dfd";
import { existentesDfdSchema } from "@/lib/dfd-validation";
import { erro, ok, parseCorpo } from "@/lib/http";
import { telaDoRecurso } from "@/lib/papeis-core";
import { dfdsVivosDosProtocolos, getProtocoloPorNumero, listarSobrescritos, protocolosDeMesmoId } from "@/lib/protocolo";

export const dynamic = "force-dynamic";

/**
 * DFDs JÁ CADASTRADOS com estes números — a importação (avulsa ou do protocolo) sabe, antes de gravar, quem
 * vai SOBRESCREVER quem, em QUALQUER unidade (a lista da Mesa é filtrada pela unidade do cabeçalho). O DFD de
 * unidade SEM ACESSO volta só como `acessivel: false` (nada dele vaza) — o servidor recusa a sobrescrita
 * (anti-sequestro) e a tela avisa antes. O que está numa Mesa em que o PAPEL não importa (ex.: a de um PCA) e o que
 * está fora das LINHAS da pessoa ("só os meus") também voltam como `acessivel: false`: a gravação os recusaria. O DFD de
 * protocolo incorporado a um PCA se sobrescreve como qualquer outro (o PCA acompanha). Com `processo`, devolve também o
 * protocolo já cadastrado do PDF (`processoGravado`).
 */
export async function POST(req: Request) {
  const a = await exigirAcesso(["dfd", "pca"], "importar");
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(existentesDfdSchema, req);
  if ("resp" in p) return p.resp;
  const esc = await escopoMesa();
  if (!esc) return erro("Faça login.", 401);
  const { acessivel } = esc;
  const achados = p.data.numeros.length > 0 ? await dfdsPorNumeros(p.data.numeros) : [];
  // Fora das LINHAS da pessoa ("só os meus") o DFD também volta só como `acessivel: false` (a gravação o recusaria).
  const existentes = achados.map(({ pcaId, ...d }) =>
    acessivel(d.reparticaoId) && dfdNasLinhas(esc, d.id) && podeTela(a.acesso, telaDoRecurso(pcaId)).importar
      ? { ...d, acessivel: true }
      : { numero: d.numero, acessivel: false },
  );
  return ok({ existentes, processo: await processoGravado(p.data.processo, esc) });
}

/**
 * O PROCESSO já cadastrado (re-importação pelo "Importar protocolo", sem o "Reenviar"): o protocolo de MESMO nº e os de
 * MESMO Id (o mesmo processo renumerado) — os DFDs vivos deles CONTINUAM no processo depois de protocolar (a importação
 * nunca apaga) e o rastro do que fica segue na conciliação da capa. Só com TODOS acessíveis e nas linhas da pessoa (senão
 * a protocolação seria recusada) — `null` = nada cadastrado (ou sem acesso).
 */
async function processoGravado(
  processo: { numero: string; idExterno: string | null } | undefined,
  esc: EscopoMesa,
) {
  if (!processo) return null;
  const [porNumero, mesmosId] = await Promise.all([
    getProtocoloPorNumero(processo.numero),
    processo.idExterno ? protocolosDeMesmoId(processo.idExterno, processo.numero) : Promise.resolve([]),
  ]);
  const todos = [...(porNumero ? [porNumero] : []), ...mesmosId];
  if (todos.length === 0 || todos.some((x) => !esc.acessivel(x.reparticaoId) || !protocoloNasLinhas(esc, x.id))) return null;
  // O que FICA depois da fusão/renumeração: o de mesmo nº, senão o 1º de mesmo Id (a MESMA régua do `iniciarProtocolo`).
  const fica = porNumero?.id ?? mesmosId[0].id;
  const [vivos, rastro] = await Promise.all([dfdsVivosDosProtocolos(todos.map((x) => x.id)), listarSobrescritos(fica, esc.acessivel)]);
  const numerosVivos = new Set(vivos.map((d) => d.numero.trim()));
  // O DFD que entra no que fica volta a estar vivo lá — o rastro dele sai (`comandosMesmoId`).
  return { dfds: vivos, sobrescritos: rastro.filter((s) => !numerosVivos.has(s.numero.trim())) };
}
