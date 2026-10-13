export function csvRow(values: unknown[]) {
  return values.map(value => {
    let text = value == null ? "" : String(value);
    // Quoting alone does not stop a spreadsheet from evaluating text formulas.
    if (/^[\s]*[=+@]/.test(text) || /^\s*-/.test(text) && !/^-\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  }).join(",") + "\r\n";
}
