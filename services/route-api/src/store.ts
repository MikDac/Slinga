/**
 * In-memory TTL stores. MVP is deliberately stateless beyond process memory
 * (PLANNING.md §5.1) — Postgres arrives in Phase 2, Redis only if ever needed.
 */

interface Entry<T> {
  value: T;
  expiresAtMs: number;
}

export class TtlStore<T> {
  private readonly entries = new Map<string, Entry<T>>();

  constructor(
    private readonly ttlS: number,
    private readonly maxEntries = 10_000,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAtMs < this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    if (this.entries.size >= this.maxEntries) {
      // Drop the oldest insertion — cheap bounded-memory policy, good enough for MVP.
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, { value, expiresAtMs: this.now() + this.ttlS * 1000 });
  }
}
