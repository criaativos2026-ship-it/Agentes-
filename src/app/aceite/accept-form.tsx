"use client";

import { useActionState } from "react";
import { acceptPrivacy, logout } from "@/app/actions/auth";
import { FormError } from "@/components/form";
import { Checkbox } from "@/components/ui/checkbox";
import { SubmitButton } from "@/components/ui/submit-button";
import { Button } from "@/components/ui/button";

export function AcceptForm() {
  const [state, action] = useActionState(acceptPrivacy, undefined);
  return (
    <div className="mt-5 grid gap-4">
      <form action={action} className="grid gap-4">
        <FormError state={state} />
        <label className="flex items-start gap-3 text-sm">
          <Checkbox name="agree" className="mt-0.5" />
          <span>Li e concordo com o aviso de privacidade.</span>
        </label>
        <SubmitButton size="lg">Concordo e quero continuar</SubmitButton>
      </form>
      <form action={logout}>
        <Button type="submit" variant="ghost" className="w-full">
          Não concordo, sair
        </Button>
      </form>
    </div>
  );
}
