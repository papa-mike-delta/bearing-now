"use client";

import type { ReactNode } from "react";

export function ChartData({ label, columns, rows }: { label: string; columns: string[]; rows: ReactNode[][] }) {
  return (
    <details className="mt-3 text-xs">
      <summary className="cursor-pointer rounded px-1 py-2 font-medium">{label} data</summary>
      <div className="max-h-72 overflow-auto rounded border border-border" tabIndex={0} role="region" aria-label={`${label} data table`}>
        <table className="w-full text-left">
          <caption className="p-2 text-left font-medium">{label}</caption>
          <thead><tr>{columns.map((column) => <th key={column} scope="col" className="border-b p-2">{column}</th>)}</tr></thead>
          <tbody>{rows.map((row, index) => (
            <tr key={index}>{row.map((value, cell) => <td key={cell} className="border-b p-2 align-top">{value}</td>)}</tr>
          ))}</tbody>
        </table>
      </div>
    </details>
  );
}

export function SeriesKey({ label, color, dashed = false }: { label: string; color: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <svg aria-hidden="true" focusable="false" width="24" height="12"><line x1="0" y1="6" x2="24" y2="6" stroke={color} strokeWidth="2" strokeDasharray={dashed ? "4 3" : undefined} /></svg>
      {label}
    </span>
  );
}
