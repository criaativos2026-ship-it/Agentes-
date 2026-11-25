"use client";

import { PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton() {
  return <Button variant="outline" className="no-print" onClick={() => window.print()}><PrinterIcon /> Imprimir / PDF</Button>;
}
