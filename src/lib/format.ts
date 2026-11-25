/** Formatação centralizada (pt-BR). Horários sempre no fuso informado (padrão: America/Sao_Paulo). */
export const DEFAULT_TZ = "America/Sao_Paulo";

const fmt = (opts: Intl.DateTimeFormatOptions, tz = DEFAULT_TZ) => new Intl.DateTimeFormat("pt-BR", { timeZone: tz, ...opts });

export function dayKey(d: Date, tz = DEFAULT_TZ) {
  return fmt({ year: "numeric", month: "2-digit", day: "2-digit" }, tz).format(d);
}

/** AAAA-MM no fuso informado — período usado nos limites mensais de consumo. */
export function periodOf(d = new Date(), tz = DEFAULT_TZ) {
  const [, m, y] = dayKey(d, tz).split("/");
  return `${y}-${m}`;
}

/** AAAA-MM-DD no fuso informado. */
export function todayISO(d = new Date(), tz = DEFAULT_TZ) {
  const [dd, m, y] = dayKey(d, tz).split("/");
  return `${y}-${m}-${dd}`;
}

export function time(d: Date, tz = DEFAULT_TZ) {
  return fmt({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }, tz).format(d);
}

/** "Hoje, 08:14" · "Ontem, 20:03" · "12 nov, 19:40" */
export function when(d: Date | string | null | undefined, tz = DEFAULT_TZ, now = new Date()) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const key = dayKey(date, tz);
  if (key === dayKey(now, tz)) return `Hoje, ${time(date, tz)}`;
  if (key === dayKey(new Date(now.getTime() - 864e5), tz)) return `Ontem, ${time(date, tz)}`;
  const sameYear = key.slice(-4) === dayKey(now, tz).slice(-4);
  const day = fmt({ day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) }, tz).format(date).replace(".", "").replace(/ de /g, " ");
  return `${day}, ${time(date, tz)}`;
}

/** "25/11/2026" */
export function dateBR(d: Date | string | null | undefined, tz = DEFAULT_TZ) {
  if (!d) return "—";
  const date = typeof d === "string" ? (d.length === 10 ? new Date(`${d}T12:00:00Z`) : new Date(d)) : d;
  return fmt({ day: "2-digit", month: "2-digit", year: "numeric" }, d && typeof d === "string" && d.length === 10 ? "UTC" : tz).format(date);
}

export function money(cents: number | null | undefined, currency = "BRL") {
  if (cents === null || cents === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(cents / 100);
}

/** Custo em micro-dólares (1e-6 USD) → "US$ 1,23". */
export function usdMicros(micros: number | null | undefined) {
  if (micros === null || micros === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD", maximumFractionDigits: micros < 1e6 ? 4 : 2 }).format(micros / 1e6);
}

export function num(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("pt-BR").format(n);
}

export function compact(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function percent(part: number, total: number) {
  if (!total) return "—";
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format((part / total) * 100)}%`;
}

export function duration(ms: number | null | undefined) {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
  return `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`;
}

export function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

export function greeting(now = new Date(), tz = DEFAULT_TZ) {
  const h = Number(fmt({ hour: "2-digit", hourCycle: "h23" }, tz).format(now));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}
