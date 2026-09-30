import { podeTela } from "@/lib/acesso";
import { dfdNasLinhas, escopoMesa } from "@/lib/acesso-mesa";
import { exigirAcesso } from "@/lib/api-auth";
import { dfdsPorNumeros } from "@/lib/dfd";
import { existentesDfdSchema } from "@/lib/dfd-validation";
import { erro, ok, parseCorpo } from "@/lib/http";
import { telaDoRecurso } from "@/lib/papeis-core";
import { travaDeDfds } from "@/lib/trava-pca";

export const dynamic = "force-dynamic";

/**
 * DFDs JÁ CADASTRADOS com estes números — a importação (avulsa ou do protocolo) sabe, antes de gravar, quem
 * vai SOBRESCREVER quem, em QUALQUER unidade (a lista da Mesa é filtrada pela unidade do cabeçalho). O DFD de
 * unidade SEM ACESSO volta só como `acessivel: false` (nada dele vaza) — o servidor recusa a sobrescrita
 * (anti-sequestro) e a tela avisa antes. O DFD de protocolo INCORPORADO a um PCA (travado) também volta como
 * `acessivel: false` — não pode ser sobrescrito enquanto estiver no PCA —, o que está numa Mesa em que o PAPEL não
 * importa (ex.: a de um PCA) e o que está fora das LINHAS da pessoa ("só os meus"): a gravação o recusaria.
 */
export async function POST(req: Request) {
  const a = await exigirAcesso(["dfd", "pca"], "importar");
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(existentesDfdSchema, req);
  if ("resp" in p) return p.resp;
  const esc = await escopoMesa();
  if (!esc) return erro("Faça login.", 401);
  const { acessivel } = esc;
  const achados = await dfdsPorNumeros(p.data.numeros);
  const travas = await travaDeDfds(achados.map((d) => d.id));
  // Fora das LINHAS da pessoa ("só os meus") o DFD também volta só como `acessivel: false` (a gravação o recusaria).
  const existentes = achados.map(({ pcaId, ...d }) =>
    !travas.has(d.id) && acessivel(d.reparticaoId) && dfdNasLinhas(esc, d.id) && podeTela(a.acesso, telaDoRecurso(pcaId)).importar
      ? { ...d, acessivel: true }
      : { numero: d.numero, acessivel: false },
  );
  return ok({ existentes });
}
