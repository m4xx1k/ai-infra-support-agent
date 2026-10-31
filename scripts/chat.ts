import { createInterface } from "node:readline/promises";
import type { Reply } from "../src/types.ts";

const base = process.env.CORE_URL ?? "http://localhost:3000";
const chatId = process.env.CHAT_ID ?? "cli";
const rl = createInterface({ input: process.stdin, output: process.stdout });
let buttons: { label: string; data: string }[] = [];

async function call(path: string, body: object): Promise<Reply[]> {
  const res = await fetch(`${base}/api/${path}`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${process.env.CORE_API_KEY ?? ""}` }, body: JSON.stringify({ chatId, ...body }) });
  return ((await res.json()) as { replies: Reply[] }).replies;
}

const show = (replies: Reply[]) => {
  buttons = [];
  for (const r of replies) {
    console.log(`\n🤖 ${r.text}`);
    for (const b of r.buttons?.flat() ?? []) {
      buttons.push(b);
      console.log(`   [${buttons.length}] ${b.label}`);
    }
  }
};

console.log(`Chat with ${base} as "${chatId}". Type a message or a button number. Start with /link 1234.`);
for (;;) {
  const line = (await rl.question("\n👤 ")).trim();
  if (!line) continue;
  const n = Number(line);
  const button = Number.isInteger(n) ? buttons[n - 1] : undefined;
  show(button ? await call("button", { data: button.data }) : await call("chat", { text: line }));
}
