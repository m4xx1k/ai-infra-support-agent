export type Button = { label: string; data: string };
export type Reply = { text: string; buttons?: Button[][] };

export type Customer = { id: string; name: string; linkCode: string };
export type SiteState = { version: string; note: string };
export type Site = { id: string; customerId: string; domain: string; status: number; state: SiteState };
export type Backup = { id: string; siteId: string; takenAt: string; state: SiteState };

export type Risk = "read" | "reversible" | "irreversible";

export type TicketStatus = "open" | "waiting_user" | "in_progress" | "resolved" | "failed" | "escalated" | "cancelled";
export type PlanStatus = "proposed" | "executed" | "failed" | "cancelled";

export type Step = { tool: string; args: unknown; result: unknown; at: string };

export type Ticket = {
  id: string;
  chatId: string;
  customerId: string;
  userName?: string;
  intent: string;
  summary: string;
  status: TicketStatus;
  steps: Step[];
  planIds: string[];
  escalationReason?: string;
  csat?: number;
  createdAt: string;
  resolvedAt?: string;
};

export type Plan = {
  id: string;
  ticketId: string;
  customerId: string;
  action: string;
  params: Record<string, unknown>;
  text: string;
  status: PlanStatus;
};

export type AuditEntry = {
  id: string;
  at: string;
  chatId: string;
  customerId: string;
  action: string;
  params: Record<string, unknown>;
  aiUnderstood: string;
  result: "executed" | "failed" | "blocked" | "rolled_back";
  detail: string;
  snapshotId?: string;
  rolledBack: boolean;
};

export type TgUser = { firstName?: string; username?: string; languageCode?: string };
export type Session = { chatId: string; customerId?: string; ticketId?: string; user?: TgUser; linkAttempts: number };

export type Ctx = { chatId: string; customerId: string; ticketId: string };
