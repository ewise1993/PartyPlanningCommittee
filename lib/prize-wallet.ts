import { pies } from "./pies.ts";
import { isTicketCount, spendFromBalance } from "./ticket-wallet.ts";
export type PrizeWallet = { tickets: number; awards: string[]; prizes: Record<string, number> };
export function purchasePie(wallet: PrizeWallet, id: string): PrizeWallet | null {
  const pie = pies.find(p => p.id === id);
  if (!pie) return null;
  const next = spendFromBalance(wallet.tickets, pie.tickets);
  const count = (wallet.prizes[id] ?? 0) + 1;
  if (next === null || !isTicketCount(count)) return null;
  return { ...wallet, tickets: next, prizes: { ...wallet.prizes, [id]: count } };
}
