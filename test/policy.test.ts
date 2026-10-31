import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApp } from "../src/app.ts";
import { PolicyError } from "../src/engine/executor.ts";

function setup() {
  const app = buildApp();
  const chatId = "t";
  app.store.session(chatId).customerId = "C-1";
  app.store.tickets.set("T-1", { id: "T-1", chatId, customerId: "C-1", intent: "", summary: "", status: "open", steps: [], planIds: [], createdAt: new Date().toISOString() });
  const ctx = { chatId, customerId: "C-1", ticketId: "T-1" };
  return { ...app, chatId, ctx };
}

test("confirm without a plan is refused", () => {
  const { executor, chatId, store } = setup();
  assert.equal(executor.confirm(chatId, "P-404").ok, false);
  assert.equal(store.blocked, 1);
});

test("foreign site cannot be read or proposed", () => {
  const { executor, ctx } = setup();
  assert.throws(() => executor.read(ctx, "list_backups", { siteId: "S-3" }), PolicyError);
  assert.throws(() => executor.propose(ctx, "restore_backup", { siteId: "S-3", backupId: "B-3-30" }), PolicyError);
});

test("another chat cannot confirm someone else's plan", () => {
  const { executor, ctx, store } = setup();
  const plan = executor.propose(ctx, "restore_backup", { siteId: "S-1", backupId: "B-1-30" });
  store.session("intruder").customerId = "C-2";
  assert.equal(executor.confirm("intruder", plan.id).ok, false);
});

test("restore runs only on confirm, snapshots first, and double confirm is a no-op", () => {
  const { executor, ctx, chatId, hosting, store } = setup();
  const plan = executor.propose(ctx, "restore_backup", { siteId: "S-1", backupId: "B-1-30" });
  assert.equal(hosting.getSite("S-1")!.status, 500);

  assert.equal(executor.confirm(chatId, plan.id).ok, true);
  assert.equal(hosting.getSite("S-1")!.status, 200);
  assert.equal(hosting.getSite("S-1")!.state.version, "backup-30.10");
  assert.ok(store.audit[0]!.snapshotId);

  executor.confirm(chatId, plan.id);
  assert.equal(store.audit.filter((a) => a.result === "executed").length, 1);
});

test("an edited plan cancels the old one", () => {
  const { executor, ctx, chatId } = setup();
  const old = executor.propose(ctx, "restore_backup", { siteId: "S-1", backupId: "B-1-30" });
  executor.propose(ctx, "restore_backup", { siteId: "S-1", backupId: "B-1-29" });
  assert.equal(executor.confirm(chatId, old.id).ok, false);
});

test("rollback restores the pre-action state", () => {
  const { executor, ctx, chatId, hosting } = setup();
  const plan = executor.propose(ctx, "restore_backup", { siteId: "S-1", backupId: "B-1-30" });
  const { auditId } = executor.confirm(chatId, plan.id);
  assert.equal(executor.rollback(auditId!).ok, true);
  assert.equal(hosting.getSite("S-1")!.status, 500);
  assert.equal(hosting.getSite("S-1")!.state.version, "plugin-update-31.10");
});
