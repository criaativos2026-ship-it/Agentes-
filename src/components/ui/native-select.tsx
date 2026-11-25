import * as React from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { fieldClass } from "./input";

/** Select nativo estilizado: no celular abre o seletor do sistema. */
function NativeSelect({ className, wrapperClassName, ...props }: React.ComponentProps<"select"> & { wrapperClassName?: string }) {
  return (
    <div data-slot="native-select-wrapper" className={cn("relative w-full", wrapperClassName)}>
      <select data-slot="native-select" className={cn(fieldClass, "h-11 appearance-none pr-10 [&>option]:bg-surface", className)} {...props} />
      <ChevronDownIcon aria-hidden className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-ink-subtle" />
    </div>
  );
}

export { NativeSelect };
