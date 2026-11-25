import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Paginação simples por query string (?page=N), preservando os outros filtros. */
export function Pagination({ page, hasMore, params }: { page: number; hasMore: boolean; params: Record<string, string | undefined> }) {
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    sp.set("page", String(p));
    return `?${sp.toString()}`;
  };
  if (page === 1 && !hasMore) return null;
  return (
    <div className="mt-4 flex items-center justify-between">
      {page > 1 ? <Button asChild variant="outline" size="sm"><Link href={href(page - 1)}>Anterior</Link></Button> : <span />}
      <span className="text-xs text-ink-subtle">Página {page}</span>
      {hasMore ? <Button asChild variant="outline" size="sm"><Link href={href(page + 1)}>Próxima</Link></Button> : <span />}
    </div>
  );
}
