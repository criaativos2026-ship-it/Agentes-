"use client";

import * as React from "react";
import { AlertDialog as P } from "radix-ui";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

const AlertDialog = (props: React.ComponentProps<typeof P.Root>) => <P.Root data-slot="alert-dialog" {...props} />;
const AlertDialogTrigger = (props: React.ComponentProps<typeof P.Trigger>) => <P.Trigger data-slot="alert-dialog-trigger" {...props} />;

function AlertDialogContent({ className, ...props }: React.ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Overlay className="fixed inset-0 z-50 bg-ink/40 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <P.Content
        data-slot="alert-dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-5 rounded-xl border border-line bg-surface p-6 shadow-[0_8px_24px_rgba(1,2,5,0.12)] duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-md",
          className,
        )}
        {...props}
      />
    </P.Portal>
  );
}

const AlertDialogHeader = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div className={cn("flex flex-col gap-2 text-left", className)} {...props} />
);
const AlertDialogFooter = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />
);
const AlertDialogTitle = ({ className, ...props }: React.ComponentProps<typeof P.Title>) => (
  <P.Title className={cn("text-lg font-semibold tracking-display", className)} {...props} />
);
const AlertDialogDescription = ({ className, ...props }: React.ComponentProps<typeof P.Description>) => (
  <P.Description className={cn("text-sm leading-relaxed text-ink-muted", className)} {...props} />
);
const AlertDialogAction = ({ className, ...props }: React.ComponentProps<typeof P.Action>) => (
  <P.Action className={cn(buttonVariants(), className)} {...props} />
);
const AlertDialogCancel = ({ className, ...props }: React.ComponentProps<typeof P.Cancel>) => (
  <P.Cancel className={cn(buttonVariants({ variant: "outline" }), className)} {...props} />
);

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};
