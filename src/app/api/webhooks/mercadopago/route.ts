import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { withPlatform } from "@/server/db/client";
import { gatewayEvents, payments } from "@/server/db/schema";
import { fetchMercadoPagoPayment, verifyMercadoPagoSignature } from "@/server/billing/gateways";
import { markPaymentPaid } from "@/server/billing/service";

/** Webhook do Mercado Pago: assinatura x-signature obrigatória; o status é confirmado na API (não confiamos no corpo). */
export async function POST(req: Request) {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  const url = new URL(req.url);
  const body = (await req.json().catch(() => ({}))) as { type?: string; data?: { id?: string } };
  const dataId = url.searchParams.get("data.id") ?? body.data?.id ?? "";
  if (!secret || !dataId || !verifyMercadoPagoSignature(dataId, req.headers.get("x-request-id") ?? "", req.headers.get("x-signature") ?? "", secret)) {
    return NextResponse.json({ error: "assinatura inválida" }, { status: 400 });
  }
  if ((body.type ?? url.searchParams.get("type")) !== "payment") return NextResponse.json({ ignored: true });
  const mp = await fetchMercadoPagoPayment(dataId);
  await withPlatform(null, async (tx) => {
    const inserted = await tx.insert(gatewayEvents).values({ gateway: "mercadopago", eventId: `${mp.id}:${mp.status}`, type: `payment.${mp.status}`, payload: mp }).onConflictDoNothing().returning({ id: gatewayEvents.id });
    if (!inserted.length) return;
    if (mp.status === "approved" && mp.external_reference) {
      const [p] = await tx.select().from(payments).where(eq(payments.id, mp.external_reference));
      if (p && Math.round((mp.transaction_amount ?? 0) * 100) === p.amountCents) await markPaymentPaid(tx, null, p.id, { method: "mercadopago", gatewayRef: String(mp.id) });
    }
    await tx.update(gatewayEvents).set({ processedAt: new Date() }).where(eq(gatewayEvents.id, inserted[0].id));
  });
  return NextResponse.json({ received: true });
}
