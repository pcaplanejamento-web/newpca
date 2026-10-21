import { type Acesso, pcasDoAcesso } from "./acesso";
import { listarPcas } from "./dfd";

/** Os PCAs que a pessoa acessa (os do grupo ativo; o ADM e o grupo sem restrição, todos) — o filtro e o vínculo dos documentos. */
export async function pcasDosDocumentos(a: Acesso) {
  const permitidos = pcasDoAcesso(a);
  const pcas = (await listarPcas()).filter((p) => !permitidos || permitidos.has(p.id)).map((p) => ({ id: p.id, nome: p.nome, ano: p.ano }));
  return { permitidos, pcas, podeTodosPcas: permitidos == null };
}
