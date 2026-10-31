import { actions } from "./actions/backups.ts";
import { Conversation } from "./conversation/conversation.ts";
import { ActionExecutor } from "./engine/executor.ts";
import { MockHostingProvider } from "./hosting/mock-provider.ts";
import { EventBus } from "./events.ts";
import { SupportStore } from "./support/store.ts";
import type { AgentDeps } from "./agent/agent.ts";

export function buildApp(overrides: Partial<Pick<AgentDeps, "model" | "now">> = {}) {
  const hosting = new MockHostingProvider();
  const store = new SupportStore();
  const executor = new ActionExecutor(actions, { hosting }, store);
  const events = new EventBus();
  const conversation = new Conversation({ hosting, store, executor, events, ...overrides });
  return { hosting, store, executor, conversation, events };
}

export type App = ReturnType<typeof buildApp>;
