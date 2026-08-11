export type PaymentStatus =
  | 'pending'
  | 'paid'
  | 'overdue'
  | 'cancelled'
  | 'partially_refunded'
  | 'refunded'

const transitions: Record<PaymentStatus, readonly PaymentStatus[]> = {
  pending: ['paid', 'overdue', 'cancelled'],
  overdue: ['paid', 'cancelled'],
  paid: ['partially_refunded', 'refunded'],
  partially_refunded: ['refunded'],
  refunded: [],
  cancelled: [],
}

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus) {
  return from === to || transitions[from].includes(to)
}

export function derivePaymentStatus(
  current: PaymentStatus,
  dueDate: string | null,
  todayIso: string,
): PaymentStatus {
  if (current !== 'pending' || !dueDate) return current
  return dueDate < todayIso ? 'overdue' : current
}

export function calculateFinanceSummary(
  payments: { amountCents: number; status: PaymentStatus }[],
  expenses: { amountCents: number }[],
) {
  const revenue = payments
    .filter(({ status }) => ['paid', 'partially_refunded'].includes(status))
    .reduce((sum, row) => sum + row.amountCents, 0)
  const pending = payments
    .filter(({ status }) => status === 'pending')
    .reduce((sum, row) => sum + row.amountCents, 0)
  const overdue = payments
    .filter(({ status }) => status === 'overdue')
    .reduce((sum, row) => sum + row.amountCents, 0)
  const expenseTotal = expenses.reduce((sum, row) => sum + row.amountCents, 0)
  const paidCount = payments.filter(({ status }) => ['paid', 'partially_refunded'].includes(status)).length
  return {
    revenueCents: revenue,
    pendingCents: pending,
    overdueCents: overdue,
    expensesCents: expenseTotal,
    resultCents: revenue - expenseTotal,
    averageTicketCents: paidCount ? Math.round(revenue / paidCount) : 0,
  }
}
