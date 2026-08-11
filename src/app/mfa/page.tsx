import { Logo } from '@/components/logo'
import { MfaManager } from '@/components/mfa-manager'
import { requireUser } from '@/lib/auth'

export default async function MfaPage() {
  await requireUser()
  return <main className="grid min-h-screen place-items-center px-5"><div className="w-full max-w-md"><div className="mb-8 flex justify-center"><Logo /></div><MfaManager challengeOnly /></div></main>
}
