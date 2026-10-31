import { google } from "@ai-sdk/google";
import { generateText, hasToolCall, isStepCount, type LanguageModel } from "ai";
import type { ActionExecutor } from "../engine/executor.ts";
import type { EventBus } from "../events.ts";
import type { SupportStore } from "../support/store.ts";
import type { Ctx } from "../types.ts";
import { systemPrompt } from "./prompt.ts";
import { buildTools, type TurnOutput } from "./tools.ts";

export type AgentDeps = { executor: ActionExecutor; store: SupportStore; events: EventBus; model?: LanguageModel; now?: () => Date };

function customerLabel(deps: AgentDeps, ctx: Ctx) {
  const user = deps.store.sessions.get(ctx.chatId)?.user;
  return [user?.firstName, user?.languageCode && `language code ${user.languageCode}`].filter(Boolean).join(", ") || "unknown name";
}

export async function runAgentTurn(ctx: Ctx, deps: AgentDeps) {
  const out: TurnOutput = {};
  const history = deps.store.ticketHistory(ctx.ticketId);
  const proposeTools = deps.executor.actions.filter((a) => a.risk !== "read").map((a) => `propose_${a.name}`);

  const result = await generateText({
    model: deps.model ?? google(process.env.GOOGLE_MODEL ?? "gemma-4-26b-a4b-it"),
    system: systemPrompt(deps.now?.() ?? new Date(), customerLabel(deps, ctx)),
    messages: history,
    tools: buildTools(ctx, deps, out),
    stopWhen: [isStepCount(8), hasToolCall("ask_user", "escalate", ...proposeTools)],
  });

  history.push(...result.response.messages);
  return { text: result.text.trim(), out };
}
