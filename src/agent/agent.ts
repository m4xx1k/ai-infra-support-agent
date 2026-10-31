import { createGoogleGenerativeAI } from "@ai-sdk/google";
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

function models(deps: AgentDeps): LanguageModel[] {
  if (deps.model) return [deps.model];
  const id = process.env.GOOGLE_MODEL ?? "gemma-4-26b-a4b-it";
  return [process.env.GOOGLE_GENERATIVE_AI_API_KEY, process.env.GOOGLE_GENERATIVE_AI_API_KEY_2]
    .filter((key): key is string => Boolean(key))
    .map((apiKey) => createGoogleGenerativeAI({ apiKey })(id));
}

export async function runAgentTurn(ctx: Ctx, deps: AgentDeps) {
  const history = deps.store.ticketHistory(ctx.ticketId);
  const proposeTools = deps.executor.actions.filter((a) => a.risk !== "read").map((a) => `propose_${a.name}`);
  const candidates = models(deps);
  let lastError: unknown = new Error("no model configured");

  for (const [i, model] of candidates.entries()) {
    const out: TurnOutput = {};
    try {
      const result = await generateText({
        model,
        maxRetries: i < candidates.length - 1 ? 1 : 2,
        system: systemPrompt(deps.now?.() ?? new Date(), customerLabel(deps, ctx)),
        messages: history,
        tools: buildTools(ctx, deps, out),
        stopWhen: [isStepCount(8), hasToolCall("ask_user", "escalate", ...proposeTools)],
      });
      history.push(...result.responseMessages);
      return { text: result.text.trim(), out };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}
