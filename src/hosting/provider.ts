import type { Backup, Site } from "../types.ts";

export interface HostingProvider {
  findCustomerByLinkCode(code: string): { id: string; name: string } | undefined;
  listSites(customerId: string): Site[];
  getSite(siteId: string): Site | undefined;
  listBackups(siteId: string): Backup[];
  restoreBackup(siteId: string, backupId: string): void;
  snapshot(siteId: string, reason: string): string;
  restoreSnapshot(snapshotId: string): void;
}
