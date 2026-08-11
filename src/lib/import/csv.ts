export type CsvResult = { headers: string[]; rows: string[][] }

export function parseCsv(input: string): CsvResult {
  const rows: string[][] = []
  let row: string[] = []
  let value = ''
  let quoted = false

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    const next = input[index + 1]
    if (char === '"' && quoted && next === '"') {
      value += '"'
      index += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      row.push(value.trim())
      value = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1
      row.push(value.trim())
      if (row.some((cell) => cell.length)) rows.push(row)
      row = []
      value = ''
    } else {
      value += char
    }
  }
  if (quoted) throw new Error('CSV inválido: aspas não finalizadas.')
  row.push(value.trim())
  if (row.some((cell) => cell.length)) rows.push(row)
  const [headers = [], ...data] = rows
  if (!headers.length) throw new Error('CSV sem cabeçalho.')
  if (new Set(headers.map((header) => header.toLowerCase())).size !== headers.length) {
    throw new Error('CSV com cabeçalhos duplicados.')
  }
  data.forEach((cells, index) => {
    if (cells.length !== headers.length) throw new Error(`Linha ${index + 2} possui número incorreto de colunas.`)
  })
  return { headers, rows: data }
}
