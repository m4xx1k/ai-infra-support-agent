import { runAgentTurn, type AgentDeps } from "../agent/agent.ts";
import type { HostingProvider } from "../hosting/provider.ts";
import { plain } from "../events.ts";
import type { Reply, Ticket, TgUser } from "../types.ts";

export type ConversationDeps = AgentDeps & { hosting: HostingProvider };

const ACTIVE = new Set(["open", "waiting_user", "in_progress"]);
const MAX_LINK_ATTEMPTS = 5;

export class Conversation {
  private deps: ConversationDeps;

  constructor(deps: ConversationDeps) {
    this.deps = deps;
  }

  async handleMessage(chatId: string, text: string, user?: TgUser): Promise<Reply[]> {
    return (await this.message(chatId, text, user)).map((r) => ({ ...r, text: plain(r.text) }));
  }

  async handleButton(chatId: string, data: string, user?: TgUser): Promise<Reply[]> {
    return (await this.button(chatId, data, user)).map((r) => ({ ...r, text: plain(r.text) }));
  }

  private async message(chatId: string, text: string, user?: TgUser): Promise<Reply[]> {
    const { store, hosting } = this.deps;
    const session = store.session(chatId);
    if (user) session.user = { ...session.user, ...user };
    const trimmed = text.trim();

    if (trimmed === "/start") {
      return [{ text: "Вітаю! Я бот підтримки хостингу: можу не лише відповісти, а й виправити — наприклад, відновити бекап. Щоб я мав доступ до акаунта, надішліть /link КОД з панелі." }];
    }
    if (trimmed.startsWith("/link")) {
      if (session.linkAttempts >= MAX_LINK_ATTEMPTS) {
        store.blocked++;
        return [{ text: "Забагато спроб. Зверніться до підтримки через панель керування." }];
      }
      session.linkAttempts++;
      const customer = hosting.consumeLinkCode(trimmed.split(/\s+/)[1] ?? "");
      if (!customer) return [{ text: "Код не підійшов або вже використаний. Візьміть новий одноразовий код у панелі керування." }];
      session.customerId = customer.id;
      session.ticketId = undefined;
      session.linkAttempts = 0;
      return [{ text: `Готово, ${customer.name}, акаунт прив'язано. Опишіть, що сталося.` }];
    }
    if (!session.customerId) {
      return [{ text: "Щоб я міг перевіряти й виправляти щось у вашому акаунті, спершу надішліть /link КОД з панелі." }];
    }

    const ticket = this.activeTicket(chatId, session.customerId);
    store.ticketHistory(ticket.id).push({ role: "user", content: trimmed });
    return this.agentTurn(ticket);
  }

  private async button(chatId: string, data: string, user?: TgUser): Promise<Reply[]> {
    const { store, executor, events } = this.deps;
    const [kind, ref, extra] = data.split(":");

    if (kind === "msg") return this.message(chatId, ref ?? "", user);

    if (kind === "confirm" || kind === "cancel") {
      const pending = store.plans.get(ref ?? "");
      if (kind === "confirm" && pending?.status === "proposed" && pending.customerId === store.sessions.get(chatId)?.customerId) {
        events.emit(chatId, { type: "status", text: "📸 Роблю знімок поточного стану і відновлюю…" });
      }
      const result = kind === "confirm" ? executor.confirm(chatId, ref ?? "") : executor.cancel(chatId, ref ?? "");
      if (result.repeated) return [{ text: result.message }];
      if (result.plan) {
        store.ticketHistory(result.plan.ticketId).push({ role: "user", content: `[system] plan ${result.plan.id} → ${result.plan.status}: ${result.message}` });
      }
      if (kind === "confirm" && result.ok && result.plan) {
        return [{ text: result.message, buttons: [[1, 2, 3, 4, 5].map((n) => ({ label: `${n}`, data: `csat:${result.plan!.ticketId}:${n}` }))] }];
      }
      return [{ text: result.message }];
    }

    if (kind === "csat") {
      const ticket = store.tickets.get(ref ?? "");
      if (ticket && ticket.chatId === chatId) ticket.csat = Number(extra);
      return [{ text: "Дякуємо за оцінку!" }];
    }

    return [{ text: "Невідома дія." }];
  }

  private activeTicket(chatId: string, customerId: string): Ticket {
    const { store } = this.deps;
    const session = store.session(chatId);
    const current = session.ticketId ? store.tickets.get(session.ticketId) : undefined;
    if (current && ACTIVE.has(current.status)) return current;
    const ticket: Ticket = {
      id: store.nextId("T"),
      chatId,
      customerId,
      userName: session.user?.firstName ?? session.user?.username,
      intent: "unknown",
      summary: "",
      status: "open",
      steps: [],
      planIds: [],
      createdAt: new Date().toISOString(),
    };
    store.tickets.set(ticket.id, ticket);
    session.ticketId = ticket.id;
    return ticket;
  }

  private async agentTurn(ticket: Ticket): Promise<Reply[]> {
    const ctx = { chatId: ticket.chatId, customerId: ticket.customerId, ticketId: ticket.id };
    let turn;
    try {
      turn = await runAgentTurn(ctx, this.deps);
    } catch (e) {
      Object.assign(ticket, { status: "escalated", escalationReason: `agent error: ${(e as Error).message}` });
      return [{ text: "Щось пішло не так з мого боку — передаю інженеру, він напише вам тут." }];
    }

    const replies: Reply[] = [];
    if (turn.text) replies.push({ text: turn.text });
    if (turn.out.question) replies.push(turn.out.question);
    if (turn.out.plan) {
      replies.push({
        text: turn.out.plan.text,
        buttons: [[{ label: "✅ Підтвердити", data: `confirm:${turn.out.plan.id}` }, { label: "❌ Скасувати", data: `cancel:${turn.out.plan.id}` }]],
      });
    }
    if (ticket.status === "escalated" && !turn.text) replies.push({ text: "Передав інженеру з усіма деталями — він відповість тут." });
    if (replies.length === 0) replies.push({ text: "Уточніть, будь ласка, що саме потрібно зробити?" });
    return replies;
  }
}
