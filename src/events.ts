import type { Reply } from "./types.ts";

export type EventPayload = { type: "replies"; replies: Reply[] } | { type: "status"; text: string };
export type CoreEvent = EventPayload & { id: number; chatId: string };

const KEEP = 500;

export const plain = (text: string) => text.replace(/\*\*|__|`/g, "");

export class EventBus {
  private events: CoreEvent[] = [];
  private nextId = 1;
  private waiters = new Set<() => void>();

  emit(chatId: string, payload: EventPayload) {
    const event = { ...payload, id: this.nextId++, chatId } as CoreEvent;
    if (event.type === "replies") event.replies = event.replies.map((r) => ({ ...r, text: plain(r.text) }));
    this.events.push(event);
    if (this.events.length > KEEP) this.events.splice(0, this.events.length - KEEP);
    for (const wake of this.waiters) wake();
  }

  async poll(after: number, chatId?: string, timeoutMs = 25_000): Promise<CoreEvent[]> {
    if (!chatId) this.events = this.events.filter((e) => e.id > after);
    const pick = () => this.events.filter((e) => e.id > after && (!chatId || e.chatId === chatId));
    const ready = pick();
    if (ready.length || timeoutMs <= 0) return ready;
    await new Promise<void>((resolve) => {
      const wake = () => {
        if (!pick().length) return;
        cleanup();
      };
      const timer = setTimeout(() => cleanup(), timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        this.waiters.delete(wake);
        resolve();
      };
      this.waiters.add(wake);
    });
    return pick();
  }
}
