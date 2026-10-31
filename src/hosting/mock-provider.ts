import seed from "../data/seed.json" with { type: "json" };
import type { Backup, Customer, Site, SiteState } from "../types.ts";
import type { HostingProvider } from "./provider.ts";

type Snapshot = { id: string; siteId: string; takenAt: string; state: SiteState; status: number; reason: string };

export class MockHostingProvider implements HostingProvider {
  private customers: Customer[] = structuredClone(seed.customers);
  private sites: Site[] = structuredClone(seed.sites);
  private backups: Backup[] = structuredClone(seed.backups);
  private snapshots = new Map<string, Snapshot>();

  private usedCodes = new Set<string>();

  consumeLinkCode(code: string) {
    const customer = this.customers.find((c) => c.linkCode === code);
    if (!customer || this.usedCodes.has(code)) return undefined;
    this.usedCodes.add(code);
    return customer;
  }

  listSites(customerId: string) {
    return this.sites.filter((s) => s.customerId === customerId);
  }

  getSite(siteId: string) {
    return this.sites.find((s) => s.id === siteId);
  }

  listBackups(siteId: string) {
    return this.backups.filter((b) => b.siteId === siteId);
  }

  restoreBackup(siteId: string, backupId: string) {
    const site = this.requireSite(siteId);
    const backup = this.backups.find((b) => b.id === backupId && b.siteId === siteId);
    if (!backup) throw new Error(`backup ${backupId} not found for ${siteId}`);
    site.state = structuredClone(backup.state);
    site.status = 200;
  }

  snapshot(siteId: string, reason: string) {
    const site = this.requireSite(siteId);
    const id = `SNAP-${this.snapshots.size + 1}`;
    this.snapshots.set(id, { id, siteId, takenAt: new Date().toISOString(), state: structuredClone(site.state), status: site.status, reason });
    return id;
  }

  restoreSnapshot(snapshotId: string) {
    const snap = this.snapshots.get(snapshotId);
    if (!snap) throw new Error(`snapshot ${snapshotId} not found`);
    const site = this.requireSite(snap.siteId);
    site.state = structuredClone(snap.state);
    site.status = snap.status;
  }

  private requireSite(siteId: string) {
    const site = this.getSite(siteId);
    if (!site) throw new Error(`site ${siteId} not found`);
    return site;
  }
}
