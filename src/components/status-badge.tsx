import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { t } from "@/i18n";

const VARIANTS: Record<string, Record<string, BadgeVariant>> = {
  org: { trial: "electric", active: "success", suspended: "warning", canceled: "danger" },
  agent: { draft: "default", testing: "electric", published: "success", disabled: "danger" },
  execution: { queued: "default", running: "electric", waiting_approval: "warning", waiting: "electric", succeeded: "success", failed: "danger", canceled: "outline", timed_out: "danger" },
  project: { new: "default", discovery: "electric", development: "electric", configuration: "electric", testing: "warning", awaiting_approval: "warning", active: "success", maintenance: "brand", suspended: "danger" },
  integration: { pending_credentials: "warning", pending_authorization: "warning", connected: "success", error: "danger", disabled: "outline" },
  subscription: { trialing: "electric", active: "success", past_due: "danger", suspended: "warning", canceled: "outline" },
  payment: { pending: "warning", paid: "success", failed: "danger", refunded: "outline", overdue: "danger", canceled: "outline" },
  ticket: { open: "brand", in_progress: "electric", waiting_customer: "warning", resolved: "success", closed: "outline" },
  task: { open: "default", in_progress: "electric", done: "success", canceled: "outline" },
};

export function StatusBadge({ kind, status }: { kind: keyof typeof VARIANTS; status: string }) {
  return <Badge variant={VARIANTS[kind]?.[status] ?? "default"}>{t(`${kind}.status.${status}`)}</Badge>;
}
