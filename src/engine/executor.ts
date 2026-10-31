import type { Action, ChangeAction, Deps, ReadAction } from "../actions/registry.ts";
import type { SupportStore } from "../support/store.ts";
import type { AuditEntry, Ctx, Plan } from "../types.ts";

export class PolicyError extends Error {}

export type ExecutionResult = { ok: boolean; message: string; plan?: Plan; auditId?: string; repeated?: boolean };

export class ActionExecutor {
  private byName: Map<string, Action>;
  private deps: Deps;
  private store: SupportStore;

  constructor(actions: Action[], deps: Deps, store: SupportStore) {
    this.byName = new Map(actions.map((a) => [a.name, a]));
    this.deps = deps;
    this.store = store;
  }

  get actions() {
    return [...this.byName.values()];
  }

  read(ctx: Ctx, name: string, rawParams: unknown) {
    const action = this.get(name);
    if (action.risk !== "read") throw new PolicyError(`${name} is not a read action`);
    const params = action.params.parse(rawParams);
    this.assertOwner(ctx, action, params);
    const result = (action as ReadAction).run(params, ctx, this.deps);
    this.step(ctx.ticketId, name, params, result);
    return result;
  }

  propose(ctx: Ctx, name: string, rawParams: unknown): Plan {
    const action = this.get(name);
    if (action.risk === "read") throw new PolicyError(`${name} is a read action`);
    const params = action.params.parse(rawParams) as Record<string, unknown>;
    this.assertOwner(ctx, action, params);
    for (const p of this.store.plans.values()) {
      if (p.ticketId === ctx.ticketId && p.status === "proposed") p.status = "cancelled";
    }
    const plan: Plan = {
      id: this.store.nextId("P"),
      ticketId: ctx.ticketId,
      customerId: ctx.customerId,
      action: name,
      params,
      text: (action as ChangeAction).plan(params, this.deps),
      status: "proposed",
    };
    this.store.plans.set(plan.id, plan);
    const ticket = this.store.tickets.get(ctx.ticketId);
    if (ticket) {
      ticket.planIds.push(plan.id);
      ticket.status = "waiting_user";
    }
    this.step(ctx.ticketId, `propose_${name}`, params, { planId: plan.id });
    return plan;
  }

  confirm(chatId: string, planId: string): ExecutionResult {
    const customerId = this.store.sessions.get(chatId)?.customerId;
    const plan = this.store.plans.get(planId);
    if (!plan || !customerId || plan.customerId !== customerId) return this.block(chatId, customerId, planId, "plan not found for this customer");
    if (plan.status === "executed") return { ok: true, message: "Цей план уже виконано.", plan, repeated: true };
    if (plan.status !== "proposed") return this.block(chatId, customerId, planId, `plan is ${plan.status}`);

    const action = this.get(plan.action) as ChangeAction;
    const ticket = this.store.tickets.get(plan.ticketId);
    if (ticket) ticket.status = "in_progress";

    const snapshotId = action.risk === "irreversible" ? this.deps.hosting.snapshot(action.siteId(plan.params), `before ${plan.id}`) : undefined;
    let ok = false;
    let detail = "";
    try {
      action.execute(plan.params, this.deps);
      ok = action.verify(plan.params, this.deps);
      detail = ok ? "verified" : "verification failed";
    } catch (e) {
      detail = (e as Error).message;
    }

    plan.status = ok ? "executed" : "failed";
    const audit = this.audit({ chatId, customerId, action: plan.action, params: plan.params, aiUnderstood: plan.text, result: ok ? "executed" : "failed", detail, snapshotId });
    if (ticket) {
      ticket.status = ok ? "resolved" : "escalated";
      if (ok) ticket.resolvedAt = new Date().toISOString();
      else ticket.escalationReason = `action failed: ${detail}`;
    }
    return { ok, message: ok ? "Готово, перевірив — сайт відповідає." : "Дія не вдалася, передаю інженеру з усіма деталями.", plan, auditId: audit.id };
  }

  cancel(chatId: string, planId: string): ExecutionResult {
    const customerId = this.store.sessions.get(chatId)?.customerId;
    const plan = this.store.plans.get(planId);
    if (!plan || plan.customerId !== customerId) return this.block(chatId, customerId, planId, "plan not found for this customer");
    if (plan.status === "proposed") plan.status = "cancelled";
    const ticket = this.store.tickets.get(plan.ticketId);
    if (ticket && ticket.status === "waiting_user") ticket.status = "cancelled";
    return { ok: true, message: "Скасовано, нічого не змінено.", plan };
  }

  rollback(auditId: string): ExecutionResult {
    const entry = this.store.audit.find((a) => a.id === auditId);
    if (!entry?.snapshotId || entry.rolledBack) return { ok: false, message: "Nothing to roll back" };
    this.deps.hosting.restoreSnapshot(entry.snapshotId);
    entry.rolledBack = true;
    this.audit({ ...entry, action: `rollback:${entry.action}`, result: "rolled_back", detail: `restored ${entry.snapshotId}`, aiUnderstood: "operator rollback" });
    return { ok: true, message: "Оператор відкотив останню зміну — сайт повернуто до стану перед дією." };
  }

  private get(name: string) {
    const action = this.byName.get(name);
    if (!action) throw new PolicyError(`unknown action ${name}`);
    return action;
  }

  private assertOwner(ctx: Ctx, action: Action, params: unknown) {
    if (!action.siteId) return;
    const site = this.deps.hosting.getSite(action.siteId(params as never));
    if (!site || site.customerId !== ctx.customerId) {
      this.block(ctx.chatId, ctx.customerId, action.name, "site does not belong to customer");
      throw new PolicyError("site not found in your account");
    }
  }

  private block(chatId: string, customerId: string | undefined, ref: string, reason: string): ExecutionResult {
    this.store.blocked++;
    this.audit({ chatId, customerId: customerId ?? "-", action: ref, params: {}, aiUnderstood: "", result: "blocked", detail: reason });
    return { ok: false, message: "Цю дію виконати не можна." };
  }

  private step(ticketId: string, tool: string, args: unknown, result: unknown) {
    this.store.tickets.get(ticketId)?.steps.push({ tool, args, result, at: new Date().toISOString() });
  }

  private audit(e: Omit<AuditEntry, "id" | "at" | "rolledBack">) {
    const entry: AuditEntry = { ...e, id: this.store.nextId("A"), at: new Date().toISOString(), rolledBack: false };
    this.store.audit.push(entry);
    return entry;
  }
}
