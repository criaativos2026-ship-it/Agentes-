import "server-only";
import { lookup as dnsLookup } from "node:dns";
import { isIP } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";

/**
 * Requisições HTTP feitas por ferramentas dos agentes, com proteção contra SSRF:
 * - só http/https, portas 80/443;
 * - o host precisa estar na lista de domínios liberados da empresa;
 * - o IP é conferido NO MOMENTO DA CONEXÃO (impede DNS rebinding): redes privadas, loopback,
 *   link-local (inclui metadados de nuvem 169.254.169.254) e afins são bloqueados;
 * - redirecionamentos não são seguidos automaticamente; resposta limitada em tamanho e tempo.
 */
export function isBlockedIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6 === "::1" || v6 === "::") return true;
  if (v6.startsWith("::ffff:")) return isBlockedIp(v6.slice(7));
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v6);
}

export function hostAllowed(host: string, allowlist: string[]) {
  const h = host.toLowerCase();
  return allowlist.some((d) => (d.startsWith("*.") ? h === d.slice(2) || h.endsWith(d.slice(1)) : h === d));
}

const guardedAgent = new Agent({
  connect: {
    lookup(hostname, options, callback) {
      dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
        if (err) return callback(err, [] as never);
        const list = (addresses as unknown as { address: string; family: number }[]) ?? [];
        const bad = list.find((a) => isBlockedIp(a.address));
        if (bad || list.length === 0) return callback(new Error(`Endereço bloqueado por segurança (${hostname}).`), [] as never);
        callback(null, list as never);
      });
    },
  },
});

export type SafeFetchResult = { status: number; contentType: string; body: string; truncated: boolean };

export async function safeFetch(
  rawUrl: string,
  opts: { method?: string; headers?: Record<string, string>; body?: string; allowlist: string[]; timeoutMs?: number; maxBytes?: number },
): Promise<SafeFetchResult> {
  const url = new URL(rawUrl);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Somente http e https são permitidos.");
  if (url.port && !["80", "443"].includes(url.port)) throw new Error("Porta não permitida.");
  if (url.username || url.password) throw new Error("Credenciais na URL não são permitidas.");
  if (isIP(url.hostname.replace(/^\[|\]$/g, ""))) throw new Error("Use um domínio, não um IP.");
  if (!hostAllowed(url.hostname, opts.allowlist)) throw new Error(`O domínio ${url.hostname} não está liberado para esta empresa.`);

  const res = await undiciFetch(url, {
    method: opts.method ?? "GET",
    headers: { "user-agent": "NEXUS-AI-Agent/1.0", ...(opts.headers ?? {}) },
    body: opts.body,
    redirect: "manual",
    dispatcher: guardedAgent,
    signal: AbortSignal.timeout(opts.timeoutMs ?? 15000),
  });
  const max = opts.maxBytes ?? 512 * 1024;
  const reader = res.body?.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) {
        truncated = true;
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
  }
  return { status: res.status, contentType: res.headers.get("content-type") ?? "", body: Buffer.concat(chunks).toString("utf8"), truncated };
}
