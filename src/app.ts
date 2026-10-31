import { actions } from "./actions/backups.ts";
import { Conversation } from "./conversation/conversation.ts";
import { ActionExecutor } from "./engine/executor.ts";
import { MockHostingProvider } from "./hosting/mock-provider.ts";
import { botNotifier, type Notifier } from "./notify.ts";
import { SupportStore } from "./support/store.ts";
import type { AgentDeps } from "./agent/agent.ts";

export function buildApp(overrides: Partial<Pick<AgentDeps, "model" | "now"> & { notify: Notifier }> = {}) {
  const hosting = new MockHostingProvider();
  const store = new SupportStore();
  const executor = new ActionExecutor(actions, { hosting }, store);
  const notify = overrides.notify ?? botNotifier;
  const conversation = new Conversation({ hosting, store, executor, ...overrides, notify });
  return { hosting, store, executor, conversation, notify };
}

export type App = ReturnType<typeof buildApp>;
