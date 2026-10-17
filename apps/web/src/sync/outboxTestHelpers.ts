// Helpers partilhados entre outbox.test.ts (Nível 1) e outboxFlusher.test.ts
// (Nível 2) — extraído para não manter duas cópias da mesma forma de
// OutboxItem/stub de localStorage a divergir em silêncio. Não termina em
// ".test.ts" de propósito: não é uma suite em si, só um módulo importado por
// suites (vitest.config.ts só coleta "src/**/*.test.ts").
import type { OutboxItem } from "./outbox";
import type { OutboxSupabaseClient } from "./outboxFlusher";

export class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

export function item(overrides: Partial<OutboxItem> = {}): OutboxItem {
  return {
    client_event_id: "ev-1",
    match_id: "match-1",
    team_id: "team-1",
    type: "golo",
    player_id: null,
    payload: {},
    ms: 1000,
    min: 0,
    sec: 1,
    period: 1,
    ...overrides,
  };
}

export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

export function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Builder fiel ao real: .from(table).select(cols).limit(n) e
// .from(table).upsert(items, opts) — cada operação controlável em separado
// via Promise própria, nunca um mock plano de "upsert: vi.fn()".
export function createMockClient(opts: {
  ping?: Promise<{ error: unknown }>;
  upsert?: Promise<{ error: unknown }>;
}): OutboxSupabaseClient {
  const ping = opts.ping ?? Promise.resolve({ error: null });
  const upsert = opts.upsert ?? Promise.resolve({ error: null });
  return {
    from() {
      return {
        select() {
          return { limit: () => ping };
        },
        upsert() {
          return upsert;
        },
      };
    },
  };
}
