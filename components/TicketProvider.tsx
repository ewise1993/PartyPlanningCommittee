"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { WALLET_KEY, isTicketCount, addToBalance, spendFromBalance } from "@/lib/ticket-wallet";

type SavedWallet = { tickets: number; awards: string[] };
type Wallet = { tickets: number; ready: boolean; addTickets: (amount: number) => Promise<boolean>; spendTickets: (amount: number) => Promise<boolean>; awardTicketsOnce: (id: string, amount: number) => Promise<boolean>; hasAward: (id: string) => boolean };
const TicketContext = createContext<Wallet | null>(null);
function readWallet(): SavedWallet {
  const raw: unknown = JSON.parse(localStorage.getItem(WALLET_KEY) ?? "0");
  if (isTicketCount(raw)) return { tickets: raw, awards: [] }; // Migrate the original balance.
  const saved = raw as Partial<SavedWallet> | null;
  if (saved && isTicketCount(saved.tickets) && Array.isArray(saved.awards) && saved.awards.every(id => typeof id === "string")) return saved as SavedWallet;
  return { tickets: 0, awards: [] };
}
export function TicketProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<SavedWallet>({ tickets: 0, awards: [] });
  const [ready, setReady] = useState(false);
  useEffect(() => {
    function sync() { try { setWallet(readWallet()); } catch { /* Keep the last known wallet if storage is unavailable. */ } }
    sync(); setReady(true);
    function changed(e: StorageEvent) { if (e.key === WALLET_KEY || e.key === null) sync(); }
    window.addEventListener("storage", changed);
    window.addEventListener("focus", sync);
    return () => { window.removeEventListener("storage", changed); window.removeEventListener("focus", sync); };
  }, []);
  const transact = useCallback(async (amount: number, spend: boolean, award?: string) => {
    // A cross-tab lock makes reading, validating, and writing one transaction.
    // Fail closed if durable storage or browser locking is unavailable.
    if (!navigator.locks) return false;
    try {
      return await navigator.locks.request(WALLET_KEY, () => {
        const current = readWallet();
        if (award && current.awards.includes(award)) { setWallet(current); return false; }
        const next = (spend ? spendFromBalance : addToBalance)(current.tickets, amount);
        if (next === null) return false;
        const saved = { tickets: next, awards: award ? [...current.awards, award] : current.awards };
        localStorage.setItem(WALLET_KEY, JSON.stringify(saved));
        setWallet(saved);
        return true;
      });
    } catch { return false; }
  }, []);
  const addTickets = useCallback((amount: number) => transact(amount, false), [transact]);
  const spendTickets = useCallback((amount: number) => transact(amount, true), [transact]);
  const awardTicketsOnce = useCallback((id: string, amount: number) => id ? transact(amount, false, id) : Promise.resolve(false), [transact]);
  return <TicketContext.Provider value={{ tickets: wallet.tickets, ready, addTickets, spendTickets, awardTicketsOnce, hasAward: id => wallet.awards.includes(id) }}>{children}</TicketContext.Provider>;
}
export function useTickets() {
  const wallet = useContext(TicketContext);
  if (!wallet) throw new Error("useTickets must be used inside TicketProvider");
  return wallet;
}
