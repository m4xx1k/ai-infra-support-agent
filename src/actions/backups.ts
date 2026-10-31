import { z } from "zod";
import { defineChange, defineRead } from "./registry.ts";

const fmt = (iso: string) => new Date(iso).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

export const listSites = defineRead({
  name: "list_sites",
  risk: "read",
  description: "List the customer's sites with their domain and current HTTP status.",
  params: z.object({}),
  run: (_p, ctx, { hosting }) => hosting.listSites(ctx.customerId).map(({ id, domain, status }) => ({ id, domain, status })),
});

export const checkSite = defineRead({
  name: "check_site",
  risk: "read",
  description: "Check whether a site responds (HTTP status).",
  params: z.object({ siteId: z.string() }),
  siteId: (p) => p.siteId,
  run: (p, _ctx, { hosting }) => {
    const site = hosting.getSite(p.siteId);
    return site && { domain: site.domain, http: site.status };
  },
});

export const listBackups = defineRead({
  name: "list_backups",
  risk: "read",
  description: "List available backups of a site, newest first.",
  params: z.object({ siteId: z.string() }),
  siteId: (p) => p.siteId,
  run: (p, _ctx, { hosting }) =>
    hosting
      .listBackups(p.siteId)
      .sort((a, b) => b.takenAt.localeCompare(a.takenAt))
      .map(({ id, takenAt }) => ({ id, takenAt, label: fmt(takenAt) })),
});

export const restoreBackup = defineChange({
  name: "restore_backup",
  risk: "irreversible",
  description: "Restore a site from a backup. Current files and database are replaced.",
  params: z.object({ siteId: z.string(), backupId: z.string() }),
  siteId: (p) => p.siteId,
  plan: (p, { hosting }) => {
    const site = hosting.getSite(p.siteId);
    const backup = hosting.listBackups(p.siteId).find((b) => b.id === p.backupId);
    if (!site || !backup) throw new Error("unknown site or backup");
    return `Відновлю ${site.domain} з бекапу від ${fmt(backup.takenAt)}. Поточні файли й база будуть замінені — перед цим я збережу знімок поточного стану, тож усе можна відкотити.`;
  },
  execute: (p, { hosting }) => hosting.restoreBackup(p.siteId, p.backupId),
  verify: (p, { hosting }) => hosting.getSite(p.siteId)?.status === 200,
});

export const actions = [listSites, checkSite, listBackups, restoreBackup];
