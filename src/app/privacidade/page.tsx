import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { PrivacyNotice } from "@/components/privacy-notice";

export const metadata: Metadata = { title: "Aviso de privacidade" };

export default function PrivacidadePage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <Link href="/" aria-label="Início">
        <Logo />
      </Link>
      <h1 className="mt-8 mb-6 text-2xl font-bold tracking-display">Aviso de privacidade</h1>
      <PrivacyNotice />
    </main>
  );
}
