import { useEffect, useRef, useCallback, useState } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';

const PROGRAM_ID = new PublicKey(import.meta.env.VITE_BET_PROGRAM_ID || '11111111111111111111111111111111');
const SOLANA_RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const POLL_INTERVAL = 5000; // 5 seconds

export interface ContractEvent {
  type: 'BetPlaced' | 'BetResolved' | 'BetCancelled';
  data: any;
  signature: string;
  slot: number;
}

interface UseContractEventsState {
  events: ContractEvent[];
  lastEvent: ContractEvent | null;
  isListening: boolean;
  error: string | null;
}

export function useContractEvents(): UseContractEventsState {
  const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
  const [events, setEvents] = useState<ContractEvent[]>([]);
  const [lastEvent, setLastEvent] = useState<ContractEvent | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSlotRef = useRef(0);

  const processLogs = useCallback((logs: string[], signature: string, slot: number) => {
    for (const log of logs) {
      if (log.includes('BetResolved')) {
        try {
          const jsonStr = log.split('BetResolved: ')[1];
          const data = JSON.parse(jsonStr);
          const event: ContractEvent = {
            type: 'BetResolved',
            data,
            signature,
            slot,
          };
          setEvents((prev) => [...prev, event]);
          setLastEvent(event);
          console.log('[useContractEvents] BetResolved:', data);
        } catch {
          const event: ContractEvent = {
            type: 'BetResolved',
            data: { raw: log },
            signature,
            slot,
          };
          setEvents((prev) => [...prev, event]);
          setLastEvent(event);
        }
      }

      if (log.includes('BetPlaced')) {
        const event: ContractEvent = {
          type: 'BetPlaced',
          data: { raw: log },
          signature,
          slot,
        };
        setEvents((prev) => [...prev, event]);
      }
    }
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      try {
        const signatures = await connection.getSignaturesForAddress(
          PROGRAM_ID,
          { limit: 10 },
          'confirmed',
        );

        for (const sig of signatures) {
          if (sig.slot <= lastSlotRef.current) continue;

          const tx = await connection.getTransaction(sig.signature, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0,
          });

          if (tx?.meta?.logMessages) {
            processLogs(tx.meta.logMessages, sig.signature, sig.slot);
          }

          lastSlotRef.current = Math.max(lastSlotRef.current, sig.slot);
        }

        setIsListening(true);
        setError(null);
      } catch (err: any) {
        console.error('[useContractEvents] Polling error:', err.message);
        setError(err.message);
      }
    };

    poll();
    interval = setInterval(poll, POLL_INTERVAL);

    return () => {
      if (interval) clearInterval(interval);
      setIsListening(false);
    };
  }, [connection, processLogs]);

  return { events, lastEvent, isListening, error };
}
