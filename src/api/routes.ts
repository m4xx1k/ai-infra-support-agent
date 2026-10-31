import type { ModelMessage } from "ai";
import { Hono, type MiddlewareHandler } from "hono";
import { z } from "zod";
import type { App } from "../app.ts";

const user = z.object({ firstName: z.string().optional(), username: z.string().optional(), languageCode: z.string().optional() }).optional();
const chatBody = z.object({ chatId: z.coerce.string().min(1), text: z.string().min(1), user });
const buttonBody = z.object({ chatId: z.coerce.string().min(1), data: z.string().min(1).max(64), user });

type Line = { role: "user" | "bot" | "tool" | "system"; text: string; tool?: string; data?: unknown };

function transcript(messages: ModelMessage[]): Line[] {
  const lines: Line[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      const text = typeof m.content === "string" ? m.content : m.content.map((p) => ("text" in p ? p.text : "")).join("");
      lines.push(text.startsWith("[system]") ? { role: "system", text: text.replace("[system] ", "") } : { role: "user", text });
      continue;
    }
    if (typeof m.content === "string") {
      if (m.role === "assistant" && m.content.trim()) lines.push({ role: "bot", text: m.content });
      continue;
    }
    for (const p of m.content) {
      if (p.type === "text" && p.text.trim()) lines.push({ role: "bot", text: p.text });
      if (p.type === "tool-call") {
        const input = p.input as Record<string, unknown>;
        if (p.toolName === "ask_user") lines.push({ role: "bot", text: String(input.question), data: input.options });
        else lines.push({ role: "tool", tool: p.toolName, text: JSON.stringify(input) });
      }
      if (p.type === "tool-result") {
        const last = [...lines].reverse().find((l) => l.role === "tool" && l.tool === p.toolName && l.data === undefined);
        if (last) last.data = "value" in p.output ? p.output.value : p.output;
      }
    }
  }
  return lines;
}

const botAuth: MiddlewareHandler = async (c, next) => {
  const key = process.env.CORE_API_KEY;
  if (key && c.req.header("authorization") !== `Bearer ${key}`) return c.json({ error: "unauthorized" }, 401);
  await next();
};

export function apiRoutes(app: App) {
  const api = new Hono();
  const { conversation, store, executor, events } = app;

  api.post("/chat", botAuth, async (c) => {
    const body = chatBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: body.error.issues }, 400);
    return c.json({ replies: await conversation.handleMessage(body.data.chatId, body.data.text, body.data.user) });
  });

  api.post("/button", botAuth, async (c) => {
    const body = buttonBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: body.error.issues }, 400);
    return c.json({ replies: await conversation.handleButton(body.data.chatId, body.data.data, body.data.user) });
  });

  api.get("/events", botAuth, async (c) => {
    const after = Number(c.req.query("after") ?? 0) || 0;
    const wait = c.req.query("wait") === "0" ? 0 : 25_000;
    return c.json({ events: await events.poll(after, c.req.query("chatId") || undefined, wait) });
  });

  api.get("/tickets", (c) => c.json([...store.tickets.values()].reverse()));

  api.get("/tickets/:id", (c) => {
    const ticket = store.tickets.get(c.req.param("id"));
    if (!ticket) return c.json({ error: "not found" }, 404);
    return c.json({
      ...ticket,
      plans: ticket.planIds.map((id) => store.plans.get(id)),
      transcript: transcript(store.history.get(ticket.id) ?? []),
      audit: store.audit.filter((a) => a.chatId === ticket.chatId),
    });
  });

  api.get("/audit", (c) => c.json([...store.audit].reverse()));

  api.get("/stats", (c) => {
    const tickets = [...store.tickets.values()];
    const resolved = tickets.filter((t) => t.status === "resolved");
    const rated = tickets.filter((t) => t.csat !== undefined);
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    return c.json({
      total: tickets.length,
      resolvedByBotPct: tickets.length ? Math.round((resolved.length / tickets.length) * 100) : 0,
      avgResolveSec: Math.round(avg(resolved.map((t) => (Date.parse(t.resolvedAt!) - Date.parse(t.createdAt)) / 1000))),
      escalated: tickets.filter((t) => t.status === "escalated").length,
      blocked: store.blocked,
      csatAvg: Number(avg(rated.map((t) => t.csat!)).toFixed(1)),
    });
  });

  api.post("/rollback/:auditId", async (c) => {
    const entry = store.audit.find((a) => a.id === c.req.param("auditId"));
    const result = executor.rollback(c.req.param("auditId"));
    if (!result.ok || !entry) return c.json(result, 400);
    events.emit(entry.chatId, { type: "replies", replies: [{ text: result.message }] });
    return c.json(result);
  });

  return api;
}
