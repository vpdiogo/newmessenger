import { performance } from "node:perf_hooks";

export type WriteCategory = "conversation" | "message";
type Entry = { attempts: number; expiresAt: number };
type Admission =
  | { admitted: true }
  | { admitted: false; reason: "quota" | "capacity"; retryAfter: number };

const policies = {
  conversation: { attempts: 20, duration: 3_600_000 },
  message: { attempts: 60, duration: 60_000 },
};

export class HttpWriteLimiter {
  private readonly entries = new Map<string, Entry>();
  private sweep = this.entries.entries();

  constructor(private readonly now: () => number = () => performance.now()) {}

  admit(category: WriteCategory, userId: string): Admission {
    const now = this.now();
    // Advance a persistent cursor rather than repeatedly scanning the first keys.
    for (let count = 0; count < 128; count += 1) {
      const next = this.sweep.next();
      if (next.done) {
        this.sweep = this.entries.entries();
        break;
      }
      const [key, entry] = next.value;
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
    const key = `${category}:${userId}`;
    let entry = this.entries.get(key);
    if (entry && entry.expiresAt <= now) {
      this.entries.delete(key);
      entry = undefined;
    }
    const policy = policies[category];
    if (entry && entry.attempts >= policy.attempts) {
      return {
        admitted: false,
        reason: "quota",
        retryAfter: Math.max(1, Math.ceil((entry.expiresAt - now) / 1000)),
      };
    }
    if (!entry) {
      if (this.entries.size >= 10_000) {
        return { admitted: false, reason: "capacity", retryAfter: 1 };
      }
      entry = { attempts: 0, expiresAt: now + policy.duration };
      this.entries.set(key, entry);
    }
    entry.attempts += 1;
    return { admitted: true };
  }

  dispose(): void {
    this.entries.clear();
    this.sweep = this.entries.entries();
  }
}
