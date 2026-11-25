import * as React from "react";
import { cn } from "@/lib/utils";

/** Tabela responsiva: rola na horizontal em telas pequenas. */
function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="relative w-full overflow-x-auto">
      <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
}
const TableHeader = ({ className, ...props }: React.ComponentProps<"thead">) => <thead className={cn("[&_tr]:border-b", className)} {...props} />;
const TableBody = ({ className, ...props }: React.ComponentProps<"tbody">) => <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
const TableRow = ({ className, ...props }: React.ComponentProps<"tr">) => (
  <tr className={cn("border-b border-line transition-colors hover:bg-surface-2/40", className)} {...props} />
);
const TableHead = ({ className, ...props }: React.ComponentProps<"th">) => (
  <th className={cn("h-10 px-4 text-left align-middle text-[12px] font-medium whitespace-nowrap text-ink-subtle", className)} {...props} />
);
const TableCell = ({ className, ...props }: React.ComponentProps<"td">) => (
  <td className={cn("px-4 py-3 align-middle", className)} {...props} />
);

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
