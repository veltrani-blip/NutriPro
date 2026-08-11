import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const includedRoots = ['src', 'supabase', 'docs']
const forbidden = [
  { pattern: /\bTODO\b/i, label: 'TODO' },
  { pattern: /\bFIXME\b/i, label: 'FIXME' },
  { pattern: /\bNutriFlow\b/i, label: 'NutriFlow' },
  { pattern: /\bcoming soon\b/i, label: 'coming soon' },
  { pattern: /\bem breve\b/i, label: 'em breve' },
]

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const output = []
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) output.push(...await files(absolute))
    else output.push(absolute)
  }
  return output
}

const findings = []
for (const relativeRoot of includedRoots) {
  for (const file of await files(path.join(root, relativeRoot))) {
    if (!/\.(?:ts|tsx|js|mjs|sql|md|css|json)$/.test(file)) continue
    const content = await readFile(file, 'utf8')
    content.split(/\r?\n/).forEach((line, index) => {
      forbidden.forEach(({ pattern, label }) => {
        if (pattern.test(line)) findings.push(`${path.relative(root, file)}:${index + 1} [${label}] ${line.trim()}`)
      })
    })
  }
}

if (findings.length) {
  console.error(findings.join('\n'))
  process.exit(1)
}
console.log('Nenhum termo funcional proibido foi encontrado em produção/documentação.')
