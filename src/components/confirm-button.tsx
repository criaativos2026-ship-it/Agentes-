"use client";

import { useState, useTransition, type ReactNode } from "react";
import type { VariantProps } from "class-variance-authority";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import type { FormState } from "@/lib/form-state";

/** Botão com janela de confirmação. Toda ação destrutiva ou irreversível usa este componente. */
export function ConfirmButton({
  children,
  title,
  description,
  confirmLabel = "Confirmar",
  onConfirm,
  successMessage,
  variant = "outline",
  size = "sm",
  className,
  disabled,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  onConfirm: () => Promise<FormState | void>;
  successMessage?: string;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
} & VariantProps<typeof buttonVariants>) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant={variant} size={size} className={className} disabled={pending || disabled} aria-label={ariaLabel}>
          {children}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className={variant === "destructive" ? buttonVariants({ variant: "destructive" }) : undefined}
            onClick={(e) => {
              e.preventDefault();
              start(async () => {
                const res = await onConfirm();
                setOpen(false);
                if (res && res.error) toast.error(res.error);
                else if (res && res.ok) toast.success(res.ok);
                else if (successMessage) toast.success(successMessage);
              });
            }}
            disabled={pending}
          >
            {pending ? "Aguarde…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
