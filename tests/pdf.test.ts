import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { describe, expect, test } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { buildClinicalPdf, buildReceiptPdf } from '@/lib/pdf'

describe('PDFs imutáveis',()=>{
  test('gera documento clínico válido e paginado',async()=>{const content=Array.from({length:85},(_,index)=>`Orientação ${index+1}: manter o acompanhamento individualizado e registrar dúvidas para a próxima consulta.`).join('\n');const bytes=await buildClinicalPdf({organizationName:'Clínica NutriPro',professionalName:'Nutricionista Responsável',registration:'CRN 00000',patientName:'Paciente de validação',title:'Orientações para acompanhamento nutricional',documentType:'Orientação',content,footer:'Documento de validação visual - sem valor clínico.'});expect(bytes.subarray(0,5).toString()).toBe('%PDF-');const pdf=await PDFDocument.load(bytes);expect(pdf.getPageCount()).toBeGreaterThan(1);if(process.env.PDF_SAMPLE_PATH){await mkdir(dirname(process.env.PDF_SAMPLE_PATH),{recursive:true});await writeFile(process.env.PDF_SAMPLE_PATH,bytes)}})
  test('gera recibo com valor e metadados',async()=>{const bytes=await buildReceiptPdf({organizationName:'Clínica NutriPro',professionalName:'Nutricionista Responsável',professionalDocument:'CRN 00000',patientName:'Paciente de validação',description:'Consulta nutricional',amountCents:25000,paymentMethod:'pix',paidAt:new Date('2026-08-10T12:00:00Z')});expect(bytes.subarray(0,5).toString()).toBe('%PDF-');expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1)})
})
