import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { when } from "@/lib/format";

export type AuditRow = { id: string; action: string; summary: string; createdAt: Date; ip?: string | null; orgName?: string | null; actor: string | null; actorEmail?: string | null };

export function AuditTable({ rows, showOrg, tz }: { rows: AuditRow[]; showOrg?: boolean; tz?: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Quando</TableHead>
          {showOrg && <TableHead>Empresa</TableHead>}
          <TableHead>Quem</TableHead>
          <TableHead>O que aconteceu</TableHead>
          <TableHead>Ação</TableHead>
          <TableHead>IP</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="whitespace-nowrap text-ink-muted">{when(r.createdAt, tz)}</TableCell>
            {showOrg && <TableCell className="text-ink-muted">{r.orgName ?? "Plataforma"}</TableCell>}
            <TableCell>{r.actor ?? <span className="text-ink-subtle">Sistema</span>}</TableCell>
            <TableCell>{r.summary}</TableCell>
            <TableCell><code className="text-xs text-ink-subtle">{r.action}</code></TableCell>
            <TableCell className="text-xs text-ink-subtle">{r.ip ?? "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
