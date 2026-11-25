import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, keyHint, safeEqual, sha256 } from "@/server/security/crypto";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { slugify } from "@/lib/validation";

describe("criptografia de segredos (AES-256-GCM)", () => {
  it("criptografa e descriptografa", () => {
    const enc = encryptSecret("sk-segredo-123", "org:1");
    expect(enc.startsWith("v1.")).toBe(true);
    expect(enc).not.toContain("segredo");
    expect(decryptSecret(enc, "org:1")).toBe("sk-segredo-123");
  });

  it("gera textos cifrados diferentes para o mesmo valor (IV aleatório)", () => {
    expect(encryptSecret("x")).not.toBe(encryptSecret("x"));
  });

  it("detecta adulteração", () => {
    const enc = encryptSecret("valor");
    const parts = enc.split(".");
    parts[3] = Buffer.from("outro").toString("base64url");
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });

  it("não decifra com contexto (AAD) de outra empresa", () => {
    const enc = encryptSecret("valor", "org:A");
    expect(() => decryptSecret(enc, "org:B")).toThrow();
  });

  it("mostra apenas uma dica da chave", () => {
    expect(keyHint("sk-ant-api03-abcdefghijkl")).toBe("sk-a…ijkl");
  });

  it("compara em tempo constante e gera hash", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(sha256("a")).toHaveLength(64);
  });
});

describe("senhas (Argon2id)", () => {
  it("gera hash e verifica", async () => {
    const h = await hashPassword("senha-forte-123");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(h, "senha-forte-123")).toBe(true);
    expect(await verifyPassword(h, "senha-errada")).toBe(false);
  });

  it("hash inválido não lança erro, só nega", async () => {
    expect(await verifyPassword("não-é-hash", "x")).toBe(false);
  });
});

describe("slugify", () => {
  it("remove acentos e símbolos", () => {
    expect(slugify("Imobiliária São João & Cia.")).toBe("imobiliaria-sao-joao-cia");
    expect(slugify("!!!")).toBe("empresa");
  });
});
