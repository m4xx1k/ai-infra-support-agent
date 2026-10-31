import type { ModelMessage } from "ai";
import type { AuditEntry, Plan, Session, Ticket } from "../types.ts";

export class SupportStore {
  sessions = new Map<string, Session>();
  tickets = new Map<string, Ticket>();
  plans = new Map<string, Plan>();
  audit: AuditEntry[] = [];
  history = new Map<string, ModelMessage[]>();
  blocked = 0;
  choiceLabels = new Map<string, string>();
  private counters = new Map<string, number>();

  nextId(prefix: string) {
    const n = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, n);
    return `${prefix}-${n}`;
  }

  session(chatId: string) {
    let s = this.sessions.get(chatId);
    if (!s) {
      s = { chatId, linkAttempts: 0 };
      this.sessions.set(chatId, s);
    }
    return s;
  }

  ticketHistory(ticketId: string) {
    let h = this.history.get(ticketId);
    if (!h) {
      h = [];
      this.history.set(ticketId, h);
    }
    return h;
  }
}
