import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'

const PAGE = { width: 595.28, height: 841.89, margin: 54 }
const brand = rgb(0.086, 0.455, 0.318)
const ink = rgb(0.063, 0.145, 0.114)
const muted = rgb(0.376, 0.447, 0.412)
const line = rgb(0.875, 0.914, 0.89)

type ClinicalPdfInput = { organizationName: string; professionalName: string; registration?: string | null; patientName: string; title: string; documentType: string; content: string; issuedAt?: Date; footer?: string | null }
type ReceiptPdfInput = { organizationName: string; professionalName: string; professionalDocument?: string | null; patientName: string; patientDocument?: string | null; description: string; amountCents: number; paymentMethod: string; paidAt: Date }

const clean = (value: string) => value.replace(/[^\S\r\n]+/g, ' ').replace(/\r\n/g, '\n').trim()

function wrap(text: string, font: PDFFont, size: number, maxWidth: number) {
  const lines: string[] = []
  for (const paragraph of clean(text).split('\n')) {
    if (!paragraph) { lines.push(''); continue }
    let current = ''
    for (const word of paragraph.split(' ')) {
      const candidate = current ? `${current} ${word}` : word
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) current = candidate
      else { if (current) lines.push(current); current = word }
    }
    if (current) lines.push(current)
  }
  return lines
}

function header(page: PDFPage, regular: PDFFont, bold: PDFFont, organizationName: string, professionalName: string, registration?: string | null) {
  page.drawRectangle({ x: 0, y: PAGE.height - 118, width: PAGE.width, height: 118, color: rgb(0.965, 0.984, 0.973) })
  page.drawRectangle({ x: 0, y: PAGE.height - 8, width: PAGE.width, height: 8, color: brand })
  page.drawText('NUTRIPRO', { x: PAGE.margin, y: PAGE.height - 48, font: bold, size: 13, color: brand })
  page.drawText(organizationName, { x: PAGE.margin, y: PAGE.height - 72, font: bold, size: 18, color: ink })
  const professional = registration ? `${professionalName} - ${registration}` : professionalName
  page.drawText(professional, { x: PAGE.margin, y: PAGE.height - 93, font: regular, size: 9.5, color: muted })
  page.drawLine({ start: { x: PAGE.margin, y: PAGE.height - 118 }, end: { x: PAGE.width - PAGE.margin, y: PAGE.height - 118 }, thickness: 1, color: line })
}

function footer(page: PDFPage, regular: PDFFont, pageNumber: number, text?: string | null) {
  page.drawLine({ start: { x: PAGE.margin, y: 48 }, end: { x: PAGE.width - PAGE.margin, y: 48 }, thickness: 1, color: line })
  page.drawText(text || 'Documento emitido pelo NutriPro.', { x: PAGE.margin, y: 31, font: regular, size: 8, color: muted })
  const pageText = `Página ${pageNumber}`
  page.drawText(pageText, { x: PAGE.width - PAGE.margin - regular.widthOfTextAtSize(pageText, 8), y: 31, font: regular, size: 8, color: muted })
}

export async function buildClinicalPdf(input: ClinicalPdfInput) {
  const pdf = await PDFDocument.create()
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const pages: PDFPage[] = []
  const addPage = () => { const page = pdf.addPage([PAGE.width,PAGE.height]); pages.push(page); return page }
  let page = addPage(), y = PAGE.height - 158
  page.drawText(input.documentType.toUpperCase(), { x: PAGE.margin, y, font: bold, size: 9, color: brand }); y -= 28
  for (const titleLine of wrap(input.title,bold,20,PAGE.width-PAGE.margin*2)) { page.drawText(titleLine,{x:PAGE.margin,y,font:bold,size:20,color:ink}); y -= 25 }
  y -= 4
  page.drawText(`Paciente: ${input.patientName}`, { x: PAGE.margin, y, font: regular, size: 10, color: muted }); y -= 17
  page.drawText(`Emitido em: ${(input.issuedAt ?? new Date()).toLocaleDateString('pt-BR')}`, { x: PAGE.margin, y, font: regular, size: 10, color: muted }); y -= 30
  for (const paragraph of clean(input.content).split('\n')) {
    const paragraphLines = paragraph ? wrap(paragraph,regular,11,PAGE.width-PAGE.margin*2) : ['']
    const paragraphHeight = paragraphLines.reduce((height,line)=>height+(line?17:10),0)
    if (y - paragraphHeight < 78) { page = addPage(); y = PAGE.height - 150 }
    for (const contentLine of paragraphLines) {
      if (contentLine) page.drawText(contentLine,{x:PAGE.margin,y,font:regular,size:11,color:ink})
      y -= contentLine ? 17 : 10
    }
  }
  for (const [index,item] of pages.entries()) { header(item,regular,bold,input.organizationName,input.professionalName,input.registration); footer(item,regular,index+1,input.footer) }
  pdf.setTitle(input.title); pdf.setAuthor(input.professionalName); pdf.setProducer('NutriPro'); pdf.setCreationDate(input.issuedAt ?? new Date())
  return Buffer.from(await pdf.save())
}

export async function buildReceiptPdf(input: ReceiptPdfInput) {
  const amount = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(input.amountCents/100)
  const content = [
    `Recebemos de ${input.patientName}${input.patientDocument ? `, documento ${input.patientDocument}` : ''}, a importância de ${amount}.`,
    '',
    `Referente a: ${input.description}.`,
    `Forma de pagamento: ${input.paymentMethod}.`,
    `Data do pagamento: ${input.paidAt.toLocaleDateString('pt-BR')}.`,
    '',
    `Profissional responsável: ${input.professionalName}${input.professionalDocument ? ` - ${input.professionalDocument}` : ''}.`,
  ].join('\n')
  return buildClinicalPdf({ organizationName: input.organizationName, professionalName: input.professionalName, registration: input.professionalDocument, patientName: input.patientName, title: 'Recibo de pagamento', documentType: 'Recibo', content, issuedAt: input.paidAt, footer: 'Recibo emitido eletronicamente pelo NutriPro.' })
}
