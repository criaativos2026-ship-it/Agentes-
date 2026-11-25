import "server-only";
import { createHmac } from "node:crypto";
import { safeEqual } from "@/server/security/crypto";

/**
 * Gateways de pagamento. Ficam INATIVOS até: (1) as chaves estarem configuradas no servidor e
 * (2) o super administrador ligar "cobrança online" depois de testar (platform_settings.billing.liveGateways).
 */
export type GatewayId = "stripe" | "mercadopago";

export const gatewayConfigured = (g: GatewayId) =>
  g === "stripe" ? Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET) : Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN && process.env.MERCADOPAGO_WEBHOOK_SECRET);

export type CheckoutInput = { paymentId: string; orgId: string; description: string; amountCents: number; currency: string; successUrl: string; cancelUrl: string };

/** Stripe Checkout (API REST oficial: https://docs.stripe.com/api/checkout/sessions/create). */
export async function createStripeCheckout(i: CheckoutInput): Promise<{ url: string; ref: string }> {
  const body = new URLSearchParams({
    mode: "payment",
    success_url: i.successUrl,
    cancel_url: i.cancelUrl,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": i.currency.toLowerCase(),
    "line_items[0][price_data][unit_amount]": String(i.amountCents),
    "line_items[0][price_data][product_data][name]": i.description.slice(0, 250),
    "metadata[payment_id]": i.paymentId,
    "metadata[organization_id]": i.orgId,
    client_reference_id: i.paymentId,
  });
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": `checkout-${i.paymentId}` },
    body,
    signal: AbortSignal.timeout(20000),
  });
  const data = (await res.json()) as { id?: string; url?: string; error?: { message?: string } };
  if (!res.ok || !data.url || !data.id) throw new Error(`Stripe: ${data.error?.message ?? res.status}`);
  return { url: data.url, ref: data.id };
}

/** Verifica o cabeçalho Stripe-Signature (t=..., v1=...) com tolerância de 5 minutos. */
export function verifyStripeSignature(payload: string, header: string, secret: string, toleranceSec = 300) {
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  return header.split(",").some((kv) => kv.startsWith("v1=") && safeEqual(kv.slice(3), expected));
}

/** Mercado Pago Checkout Pro (https://www.mercadopago.com.br/developers/pt/reference/preferences/_checkout_preferences/post). */
export async function createMercadoPagoCheckout(i: CheckoutInput): Promise<{ url: string; ref: string }> {
  const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`, "Content-Type": "application/json", "X-Idempotency-Key": `pref-${i.paymentId}` },
    body: JSON.stringify({
      items: [{ title: i.description.slice(0, 250), quantity: 1, unit_price: i.amountCents / 100, currency_id: i.currency }],
      external_reference: i.paymentId,
      back_urls: { success: i.successUrl, failure: i.cancelUrl, pending: i.successUrl },
      auto_return: "approved",
      notification_url: `${(process.env.APP_URL ?? "").replace(/\/$/, "")}/api/webhooks/mercadopago`,
    }),
    signal: AbortSignal.timeout(20000),
  });
  const data = (await res.json()) as { id?: string; init_point?: string; message?: string };
  if (!res.ok || !data.init_point || !data.id) throw new Error(`Mercado Pago: ${data.message ?? res.status}`);
  return { url: data.init_point, ref: data.id };
}

/** Assinatura do webhook do Mercado Pago (x-signature: ts=...,v1=...). */
export function verifyMercadoPagoSignature(dataId: string, requestId: string, header: string, secret: string) {
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.trim().split("=") as [string, string]));
  if (!parts.ts || !parts.v1) return false;
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${parts.ts};`;
  return safeEqual(parts.v1, createHmac("sha256", secret).update(manifest).digest("hex"));
}

/** Consulta o pagamento na API do Mercado Pago (fonte da verdade do status). */
export async function fetchMercadoPagoPayment(id: string) {
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Mercado Pago respondeu ${res.status}`);
  return (await res.json()) as { id: number; status: string; external_reference?: string; transaction_amount?: number };
}
