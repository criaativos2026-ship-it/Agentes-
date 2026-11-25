import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { withPlatform } from "@/server/db/client";
import { gatewayEvents, payments } from "@/server/db/schema";
import { verifyStripeSignature } from "@/server/billing/gateways";
import { markPaymentPaid } from "@/server/billing/service";

/** Webhook do Stripe: assinatura obrigatória e idempotência por ID do evento. */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const raw = await req.text();
  if (!secret || !verifyStripeSignature(raw, req.headers.get("stripe-signature") ?? "", secret)) return NextResponse.json({ error: "assinatura inválida" }, { status: 400 });
  const event = JSON.parse(raw) as { id: string; type: string; data: { object: { id: string; payment_status?: string; metadata?: { payment_id?: string } } } };
  await withPlatform(null, async (tx) => {
    const inserted = await tx.insert(gatewayEvents).values({ gateway: "stripe", eventId: event.id, type: event.type, payload: event }).onConflictDoNothing().returning({ id: gatewayEvents.id });
    if (!inserted.length) return; // já processado
    const obj = event.data.object;
    if (event.type === "checkout.session.completed" && obj.payment_status === "paid" && obj.metadata?.payment_id) {
      const [p] = await tx.select({ id: payments.id }).from(payments).where(eq(payments.id, obj.metadata.payment_id));
      if (p) await markPaymentPaid(tx, null, p.id, { method: "stripe", gatewayRef: obj.id });
    }
    await tx.update(gatewayEvents).set({ processedAt: new Date() }).where(eq(gatewayEvents.id, inserted[0].id));
  });
  return NextResponse.json({ received: true });
}
