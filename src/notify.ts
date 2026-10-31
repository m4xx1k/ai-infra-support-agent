import type { Reply } from "./types.ts";

export type PushResult = { ok: boolean; error?: string };
export type Notifier = (chatId: string, replies: Reply[]) => Promise<PushResult>;

export const plain = (text: string) => text.replace(/\*\*|__|`/g, "");

export const botNotifier: Notifier = async (chatId, replies) => {
  const url = process.env.BOT_URL;
  if (!url) return { ok: false, error: "no_bot_url" };
  try {
    const res = await fetch(`${url}/push`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-push-secret": process.env.PUSH_SECRET ?? "" },
      body: JSON.stringify({ chatId, replies }),
    });
    return (await res.json().catch(() => ({ ok: res.ok }))) as PushResult;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
};
