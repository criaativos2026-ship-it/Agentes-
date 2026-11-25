"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Point = { day: string; total: number; failed: number };

const COLORS = { ok: "var(--nx-chart-1)", failed: "var(--nx-chart-critical)", grid: "var(--nx-chart-grid)", text: "var(--nx-ink-subtle)" };

function label(day: string) {
  const [, m, d] = day.split("-");
  return `${d}/${m}`;
}

/**
 * Execuções por dia (últimos 30 dias): colunas empilhadas "concluídas/outras" + "com erro".
 * Regras da skill dataviz: colunas ≤ 24px com topo arredondado, 2px de intervalo entre segmentos,
 * grade recessiva, legenda sempre visível (2 séries), tooltip ao passar o mouse e tabela acessível.
 */
export function ExecutionsChart({ data }: { data: Point[] }) {
  const rows = data.map((d) => ({ day: d.day, ok: d.total - d.failed, failed: d.failed }));
  return (
    <figure>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-ink-muted" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: COLORS.ok }} /> Concluídas e demais
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: COLORS.failed }} /> Com erro
        </span>
      </div>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: -16 }} barCategoryGap={2}>
            <CartesianGrid vertical={false} stroke={COLORS.grid} strokeWidth={1} />
            <XAxis dataKey="day" tickFormatter={label} tick={{ fill: COLORS.text, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={16} />
            <YAxis allowDecimals={false} tick={{ fill: COLORS.text, fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              contentStyle={{ background: "var(--nx-surface-2)", border: "1px solid var(--nx-border-strong)", borderRadius: 10, fontSize: 12 }}
              labelStyle={{ color: "var(--nx-ink)", fontWeight: 600 }}
              itemStyle={{ color: "var(--nx-ink-muted)" }}
              labelFormatter={(d) => label(String(d))}
              formatter={(v, name) => [v, name === "failed" ? "Com erro" : "Concluídas e demais"]}
            />
            <Bar dataKey="ok" stackId="a" fill={COLORS.ok} maxBarSize={24} stroke="var(--nx-surface)" strokeWidth={2} />
            <Bar dataKey="failed" stackId="a" fill={COLORS.failed} maxBarSize={24} radius={[4, 4, 0, 0]} stroke="var(--nx-surface)" strokeWidth={2} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-3 text-xs text-ink-muted">
        <summary className="cursor-pointer select-none hover:text-ink">Ver como tabela</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr className="text-ink-subtle">
              <th className="py-1 font-medium">Dia</th>
              <th className="py-1 font-medium">Total</th>
              <th className="py-1 font-medium">Com erro</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.day} className="border-t border-line">
                <td className="py-1">{label(d.day)}</td>
                <td className="py-1 tabular-nums">{d.total}</td>
                <td className="py-1 tabular-nums">{d.failed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <figcaption className="sr-only">Execuções por dia nos últimos 30 dias, separando as que terminaram com erro.</figcaption>
    </figure>
  );
}
