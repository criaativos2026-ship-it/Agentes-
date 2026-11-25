"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import type { FormState } from "@/lib/form-state";

/** Rótulo + campo + dica. */
export function Field({ label, htmlFor, hint, children, className }: { label: string; htmlFor: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className ?? "grid gap-2"}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs leading-relaxed text-ink-subtle">{hint}</p>}
    </div>
  );
}

/** Erros aparecem junto ao formulário; sucessos viram aviso rápido (toast). */
export function FormError({ state }: { state?: FormState }) {
  if (!state?.error) return null;
  return (
    <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">
      {state.error}
    </p>
  );
}

/** Mostra o toast de sucesso e devolve uma ref para limpar o formulário. */
export function useFormFeedback(state: FormState, { reset = true, onSuccess }: { reset?: boolean; onSuccess?: () => void } = {}) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) {
      toast.success(state.ok);
      if (reset) ref.current?.reset();
      onSuccess?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return ref;
}
