"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { WALLET_KEY, isTicketCount, addToBalance, spendFromBalance } from "@/lib/ticket-wallet";

type Wallet = { tickets: number; ready: boolean; addTickets: (amount: number) => boolean; spendTickets: (amount: number) => boolean };
const TicketContext = createContext<Wallet | null>(null);
export function TicketProvider({ children }: { children: ReactNode }) {
  const [tickets, setTickets] = useState(0);
  const [ready, setReady] = useState(false);
  const balance = useRef(0);
  const loaded = useRef(false);
  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(WALLET_KEY) ?? "0");
      balance.current = isTicketCount(stored) ? stored : 0;
    } catch { balance.current = 0; }
    setTickets(balance.current);
    loaded.current = true;
    setReady(true);
  }, []);
  const update = useCallback((amount: number, operation: typeof addToBalance) => {
    if (!loaded.current) return false;
    const next = operation(balance.current, amount);
    if (next === null) return false;
    balance.current = next;
    setTickets(next);
    try { localStorage.setItem(WALLET_KEY, JSON.stringify(next)); } catch { /* In-memory wallet still works when storage is unavailable. */ }
    return true;
  }, []);
  const addTickets = useCallback((amount: number) => update(amount, addToBalance), [update]);
  const spendTickets = useCallback((amount: number) => update(amount, spendFromBalance), [update]);
  return <TicketContext.Provider value={{ tickets, ready, addTickets, spendTickets }}>{children}</TicketContext.Provider>;
}
export function useTickets() {
  const wallet = useContext(TicketContext);
  if (!wallet) throw new Error("useTickets must be used inside TicketProvider");
  return wallet;
}
