import { describe, expect, it } from 'vitest'
import { calculateFinanceSummary, canTransitionPayment, derivePaymentStatus } from '@/lib/finance/rules'
import { parseCsv } from '@/lib/import/csv'

describe('regras financeiras', () => {
  it('aceita somente transições válidas', () => {
    expect(canTransitionPayment('pending', 'paid')).toBe(true)
    expect(canTransitionPayment('refunded', 'paid')).toBe(false)
    expect(derivePaymentStatus('pending', '2026-08-09', '2026-08-10')).toBe('overdue')
  })

  it('calcula o resumo somente a partir de registros informados', () => {
    expect(calculateFinanceSummary([
      { amountCents: 20_000, status: 'paid' },
      { amountCents: 10_000, status: 'pending' },
      { amountCents: 5_000, status: 'overdue' },
    ], [{ amountCents: 7_000 }])).toEqual({
      revenueCents: 20_000,
      pendingCents: 10_000,
      overdueCents: 5_000,
      expensesCents: 7_000,
      resultCents: 13_000,
      averageTicketCents: 20_000,
    })
  })
})

describe('parser CSV', () => {
  it('trata vírgulas e aspas escapadas', () => {
    expect(parseCsv('nome,email\n"Silva, Ana",ana@example.com\n"Joana ""Jô""",jo@example.com').rows)
      .toEqual([['Silva, Ana', 'ana@example.com'], ['Joana "Jô"', 'jo@example.com']])
  })

  it('rejeita linhas inválidas sem inserção silenciosa', () => {
    expect(() => parseCsv('nome,email\nAna')).toThrow('Linha 2')
  })
})
