export function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index += 1 }
      else quoted = !quoted
    } else if (char === ',' && !quoted) { row.push(field.trim()); field = '' }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      row.push(field.trim()); field = ''
      if (row.some((cell) => cell.length)) rows.push(row)
      row = []
    } else field += char
  }
  row.push(field.trim())
  if (row.some((cell) => cell.length)) rows.push(row)
  if (quoted) throw new Error('CSV contains an unclosed quoted field')
  if (rows.length < 2) throw new Error('CSV needs a header row and at least one product')
  const headers = rows[0].map((header) => header.trim().toLowerCase())
  return rows.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])))
}
