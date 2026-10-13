/**
 * Neutralize spreadsheet formula injection: a cell starting with `=`, `+`, `-` or `@` (or a
 * control character that Excel skips over) is prefixed with a single quote so Excel/Sheets
 * treat it as text, not a formula.
 */
export function csvSafeCell(cell: unknown): string {
  const value = String(cell ?? "");
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** Build CSV and trigger download in the browser. */
export function downloadCsv(filename: string, rows: string[][]): void {
  const content = rows
    .map((row) =>
      row
        .map((cell) => {
          const value = csvSafeCell(cell);
          if (/[",\n]/.test(value)) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        })
        .join(",")
    )
    .join("\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
