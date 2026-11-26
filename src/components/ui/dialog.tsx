"use client";

import * as React from "react";
import { Dialog as P } from "radix-ui";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const Dialog = (props: React.ComponentProps<typeof P.Root>) => <P.Root data-slot="dialog" {...props} />;
const DialogTrigger = (props: React.ComponentProps<typeof P.Trigger>) => <P.Trigger data-slot="dialog-trigger" {...props} />;
const DialogClose = P.Close;

function DialogContent({ className, children, side, ...props }: React.ComponentProps<typeof P.Content> & { side?: "left" | "center" }) {
  return (
    <P.Portal>
      <P.Overlay className="fixed inset-0 z-50 bg-ink/40 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <P.Content
        data-slot="dialog-content"
        className={cn(
          side === "left"
            ? "fixed inset-y-0 left-0 z-50 flex w-[86%] max-w-xs flex-col border-r border-line bg-bg shadow-[0_8px_24px_rgba(1,2,5,0.12)] data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:animate-in data-[state=open]:slide-in-from-left"
            : "fixed top-1/2 left-1/2 z-50 grid max-h-[90dvh] w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl border border-line bg-surface p-6 shadow-[0_8px_24px_rgba(1,2,5,0.12)] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 sm:max-w-lg",
          className,
        )}
        {...props}
      >
        {children}
        <P.Close className="absolute top-4 right-4 rounded-md p-1 text-ink-subtle hover:bg-surface-2 hover:text-ink" aria-label="Fechar">
          <XIcon className="size-4" />
        </P.Close>
      </P.Content>
    </P.Portal>
  );
}

const DialogTitle = ({ className, ...props }: React.ComponentProps<typeof P.Title>) => (
  <P.Title className={cn("text-lg font-semibold tracking-display", className)} {...props} />
);
const DialogDescription = ({ className, ...props }: React.ComponentProps<typeof P.Description>) => (
  <P.Description className={cn("text-sm text-ink-muted", className)} {...props} />
);

export { Dialog, DialogTrigger, DialogClose, DialogContent, DialogTitle, DialogDescription };
