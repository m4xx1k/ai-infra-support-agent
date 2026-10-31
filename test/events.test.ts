import assert from "node:assert/strict";
import { test } from "node:test";
import { EventBus } from "../src/events.ts";

test("bot ack (after=N) deletes delivered events; restart without after gets only the rest", async () => {
  const bus = new EventBus();
  bus.emit("a", { type: "status", text: "one" });
  bus.emit("b", { type: "replies", replies: [{ text: "**two**" }] });
  const bot = await bus.poll(0, undefined, 0);
  assert.deepEqual(bot.map((e) => e.id), [1, 2]);
  assert.equal(bot[1]!.type === "replies" && bot[1]!.replies[0]!.text, "two");
  assert.deepEqual(await bus.poll(1, undefined, 0).then((es) => es.map((e) => e.id)), [2]);
  assert.deepEqual(await bus.poll(0, undefined, 0).then((es) => es.map((e) => e.id)), [2]);
  assert.deepEqual(await bus.poll(2, undefined, 0), []);
});

test("long poll wakes up on a new event for the right chat", async () => {
  const bus = new EventBus();
  const waiting = bus.poll(0, "a", 2000);
  bus.emit("b", { type: "status", text: "other chat" });
  setTimeout(() => bus.emit("a", { type: "status", text: "mine" }), 20);
  const got = await waiting;
  assert.deepEqual(got.map((e) => e.chatId), ["a"]);
});
