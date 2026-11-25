import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { compact, when } from "@/lib/format";

type Row = { id: string; status: string; isTest: boolean; input: Record<string, unknown>; error: string | null; createdAt: Date; tokens: number; agentName: string | null; orgName: string; by: string | null };

export function ExecutionTable({ rows, hrefFor, showOrg, tz }: { rows: Row[]; hrefFor: (id: string) => string; showOrg?: boolean; tz?: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Quando</TableHead>
          {showOrg && <TableHead>Empresa</TableHead>}
          <TableHead>Agente</TableHead>
          <TableHead>Solicitação</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Tokens</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const req = String(r.input.message ?? r.input.task ?? "");
          return (
            <TableRow key={r.id}>
              <TableCell className="whitespace-nowrap text-ink-muted"><Link href={hrefFor(r.id)} className="hover:text-electric">{when(r.createdAt, tz)}</Link></TableCell>
              {showOrg && <TableCell className="text-ink-muted">{r.orgName}</TableCell>}
              <TableCell className="font-medium">{r.agentName ?? "—"} {r.isTest && <Badge variant="electric" className="ml-1">Teste</Badge>}</TableCell>
              <TableCell className="max-w-80">
                <Link href={hrefFor(r.id)} className="block truncate hover:text-electric">{req || "—"}</Link>
                {r.error && <span className="block truncate text-xs text-danger">{r.error}</span>}
                {r.by && <span className="block text-xs text-ink-subtle">{r.by}</span>}
              </TableCell>
              <TableCell><StatusBadge kind="execution" status={r.status} /></TableCell>
              <TableCell className="text-right tabular-nums text-ink-muted">{compact(r.tokens)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
