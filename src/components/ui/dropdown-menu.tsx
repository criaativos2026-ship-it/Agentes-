"use client";

import * as React from "react";
import { DropdownMenu as P } from "radix-ui";
import { cn } from "@/lib/utils";

const DropdownMenu = (props: React.ComponentProps<typeof P.Root>) => <P.Root data-slot="dropdown-menu" {...props} />;
const DropdownMenuTrigger = (props: React.ComponentProps<typeof P.Trigger>) => <P.Trigger data-slot="dropdown-menu-trigger" {...props} />;

function DropdownMenuContent({ className, sideOffset = 8, ...props }: React.ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        className={cn(
          "z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-[14rem] overflow-y-auto rounded-xl border border-line-strong bg-popover p-1.5 text-popover-foreground shadow-2xl data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
          className,
        )}
        {...props}
      />
    </P.Portal>
  );
}

function DropdownMenuItem({ className, variant = "default", ...props }: React.ComponentProps<typeof P.Item> & { variant?: "default" | "destructive" }) {
  return (
    <P.Item
      data-slot="dropdown-menu-item"
      data-variant={variant}
      className={cn(
        "relative flex cursor-default items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-hidden select-none focus:bg-surface data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[variant=destructive]:text-danger [&_svg]:size-4 [&_svg:not([class*='text-'])]:text-ink-subtle",
        className,
      )}
      {...props}
    />
  );
}

const DropdownMenuLabel = ({ className, ...props }: React.ComponentProps<typeof P.Label>) => (
  <P.Label className={cn("px-2.5 py-2 text-sm", className)} {...props} />
);
const DropdownMenuSeparator = ({ className, ...props }: React.ComponentProps<typeof P.Separator>) => (
  <P.Separator className={cn("-mx-1.5 my-1.5 h-px bg-line", className)} {...props} />
);

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator };
