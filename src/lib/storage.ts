import 'server-only'
import { randomUUID } from 'node:crypto'

type StorageClient = {
  storage: { from: (bucket: string) => { upload: (path: string, body: File, options: { contentType: string; upsert: boolean }) => Promise<{ error: { message: string } | null }> } }
}

const signatures: Record<string, (bytes: Uint8Array) => boolean> = {
  'image/jpeg': (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  'image/png': (bytes) => bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47,
  'image/webp': (bytes) => new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP',
  'application/pdf': (bytes) => new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-',
}
const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }

export async function validatePrivateFile(file: File, options: { maxBytes: number; allowedTypes: string[] }) {
  if (!file.size) return null
  if (file.size > options.maxBytes || !options.allowedTypes.includes(file.type)) throw new Error('Arquivo com tipo ou tamanho não permitido.')
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  if (!signatures[file.type]?.(bytes)) throw new Error('A assinatura binária do arquivo não corresponde ao MIME informado.')
  return file
}

export async function uploadPrivateFile(
  client: StorageClient,
  bucket: string,
  organizationId: string,
  ownerId: string,
  file: File,
) {
  const extension = extensions[file.type]
  if (!extension) throw new Error('Extensão de arquivo não permitida.')
  const objectPath = `${organizationId}/${ownerId}/${randomUUID()}.${extension}`
  const { error } = await client.storage.from(bucket).upload(objectPath, file, { contentType: file.type, upsert: false })
  if (error) throw new Error('Não foi possível armazenar o arquivo privado.')
  return objectPath
}
