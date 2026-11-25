"use client";

import * as React from "react";
import { Tabs as P } from "radix-ui";
import { cn } from "@/lib/utils";

const Tabs = (props: React.ComponentProps<typeof P.Root>) => <P.Root data-slot="tabs" {...props} />;
const TabsList = ({ className, ...props }: React.ComponentProps<typeof P.List>) => (
  <P.List className={cn("inline-flex max-w-full gap-1 overflow-x-auto rounded-lg border border-line bg-bg-alt p-1", className)} {...props} />
);
const TabsTrigger = ({ className, ...props }: React.ComponentProps<typeof P.Trigger>) => (
  <P.Trigger
    className={cn(
      "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium whitespace-nowrap text-ink-muted transition-colors outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-electric/40 data-[state=active]:bg-surface-2 data-[state=active]:text-ink [&_svg]:size-4",
      className,
    )}
    {...props}
  />
);
const TabsContent = ({ className, ...props }: React.ComponentProps<typeof P.Content>) => (
  <P.Content className={cn("mt-5 outline-none", className)} {...props} />
);

export { Tabs, TabsList, TabsTrigger, TabsContent };
