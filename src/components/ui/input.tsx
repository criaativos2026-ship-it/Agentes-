import * as React from "react";
import { cn } from "@/lib/utils";

export const fieldClass =
  "w-full min-w-0 rounded-lg border border-input bg-surface px-3.5 text-[15px] text-ink transition-[color,box-shadow,border-color] outline-none placeholder:text-ink-subtle disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-electric focus-visible:ring-1 focus-visible:ring-electric aria-invalid:border-danger";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return <input type={type} data-slot="input" className={cn(fieldClass, "h-11", type === "file" && "h-auto py-2.5", className)} {...props} />;
}

export { Input };
