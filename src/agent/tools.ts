import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { PolicyError } from "../engine/executor.ts";
import type { AgentDeps } from "./agent.ts";
import type { Button, Ctx, Plan } from "../types.ts";

export type TurnOutput = { question?: { text: string; buttons: Button[][] }; plan?: Plan };

const safely = (fn: () => unknown) => {
  try {
    return fn();
  } catch (e) {
    if (e instanceof PolicyError || e instanceof z.ZodError) return { error: e.message };
    throw e;
  }
};

const STATUS: Record<string, string> = {
  list_sites: "🔎 Дивлюсь ваші сайти…",
  check_site: "🔎 Перевіряю, чи відповідає сайт…",
  list_backups: "🗂 Шукаю бекапи…",
};

export function buildTools(ctx: Ctx, { executor, store, events }: AgentDeps, out: TurnOutput): ToolSet {
  const tools: ToolSet = {};

  for (const action of executor.actions) {
    if (action.risk === "read") {
      tools[action.name] = tool({
        description: action.description,
        inputSchema: action.params,
        execute: async (input) => {
          if (STATUS[action.name]) events.emit(ctx.chatId, { type: "status", text: STATUS[action.name]! });
          return safely(() => executor.read(ctx, action.name, input));
        },
      });
    } else {
      tools[`propose_${action.name}`] = tool({
        description: `Propose: ${action.description} Creates a plan the customer must confirm with a button. Does not execute anything.`,
        inputSchema: action.params,
        execute: async (input) =>
          safely(() => {
            out.plan = executor.propose(ctx, action.name, input);
            return { planId: out.plan.id, planText: out.plan.text, status: "waiting for customer confirmation" };
          }),
      });
    }
  }

  tools.ask_user = tool({
    description: "Ask the customer one question with clickable options. Use for choosing a site, a backup date, etc.",
    inputSchema: z.object({
      question: z.string(),
      options: z.array(z.object({ label: z.string(), value: z.string().max(50) })).min(1).max(8),
    }),
    execute: async ({ question, options }) => {
      out.question = { text: question, buttons: options.map((o) => [{ label: o.label, data: `msg:${o.value}` }]) };
      return { shown: true };
    },
  });

  tools.update_ticket = tool({
    description: "Record what the customer wants: short intent (e.g. restore_backup) and a one-sentence summary.",
    inputSchema: z.object({ intent: z.string(), summary: z.string() }),
    execute: async ({ intent, summary }) => {
      const ticket = store.tickets.get(ctx.ticketId);
      if (ticket) Object.assign(ticket, { intent, summary });
      return { ok: true };
    },
  });

  tools.escalate = tool({
    description: "Hand the ticket to a human engineer with a short summary of what was checked and why you cannot finish.",
    inputSchema: z.object({ reason: z.string() }),
    execute: async ({ reason }) => {
      const ticket = store.tickets.get(ctx.ticketId);
      if (ticket) Object.assign(ticket, { status: "escalated", escalationReason: reason });
      return { ok: true };
    },
  });

  return tools;
}
