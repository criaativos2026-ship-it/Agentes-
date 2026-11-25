"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { payOnlineAction } from "@/app/actions/billing";
import { Button } from "@/components/ui/button";

export function PayButtons({ slug, paymentId, gateways }: { slug: string; paymentId: string; gateways: ("stripe" | "mercadopago")[] }) {
  const [pending, start] = useTransition();
  return (
    <span className="mt-1 flex gap-2">
      {gateways.map((g) => (
        <Button key={g} size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { const r = await payOnlineAction(slug, paymentId, g); if (r?.error) toast.error(r.error); })}>
          Pagar com {g === "stripe" ? "cartão (Stripe)" : "Mercado Pago"}
        </Button>
      ))}
    </span>
  );
}
