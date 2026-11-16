// A trava da SESSÃO da Centi entre as abas do sistema. Pura (só `navigator.locks` quando existe).

/**
 * A SESSÃO da Centi é uma só (o Emitir DFD usa o registro aberto por último): load → emissão → download de um DFD nunca
 * podem intercalar com os de outro — nem de OUTRA aba do sistema (o vigia do agendador, outra execução), que usa a mesma
 * aba da Centi pela extensão. A trava `navigator.locks` vale entre todas as abas do sistema no navegador; sem ela (testes,
 * navegador antigo), só a fila da aba. Quem já está dentro da trava NUNCA chama de novo (a trava não é reentrante).
 */
export async function comSessaoCenti<T>(fn: () => Promise<T>): Promise<T> {
  const locks = (globalThis as { navigator?: { locks?: { request: (nome: string, f: () => Promise<T>) => Promise<T> } } }).navigator?.locks;
  return locks ? locks.request("centi-sessao", fn) : fn();
}

