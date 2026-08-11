import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    },
  )
  const { data: { user } } = await supabase.auth.getUser()
  const protectedPath = request.nextUrl.pathname.startsWith('/app') || request.nextUrl.pathname.startsWith('/portal') || request.nextUrl.pathname.startsWith('/onboarding') || request.nextUrl.pathname === '/mfa'
  if (!user && protectedPath) {
    const url = request.nextUrl.clone(); url.pathname = '/login'; url.searchParams.set('redirectTo', request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }
  async function authenticatedHome() {
    if (!user) return '/login'
    const [{ data: membership }, { data: patientLink }] = await Promise.all([
      supabase.from('organization_members').select('id').eq('user_id',user.id).eq('active',true).limit(1).maybeSingle(),
      supabase.from('patient_user_links').select('id').eq('user_id',user.id).eq('active',true).limit(1).maybeSingle(),
    ])
    return membership ? '/app/dashboard' : patientLink ? '/portal' : '/onboarding'
  }
  if (user && ['/login', '/cadastro'].includes(request.nextUrl.pathname)) {
    const requested = request.nextUrl.searchParams.get('next')
    const url = request.nextUrl.clone(); url.search=''; url.pathname = requested?.startsWith('/')&&!requested.startsWith('//') ? requested : await authenticatedHome(); return NextResponse.redirect(url)
  }
  if (user && protectedPath) {
    const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    const needsMfa = assurance?.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2'
    if (needsMfa && request.nextUrl.pathname !== '/mfa') {
      const url = request.nextUrl.clone(); url.pathname = '/mfa'; return NextResponse.redirect(url)
    }
    if (!needsMfa && request.nextUrl.pathname === '/mfa') {
      const requested = request.nextUrl.searchParams.get('next')
      const url = request.nextUrl.clone(); url.search=''; url.pathname = requested?.startsWith('/')&&!requested.startsWith('//') ? requested : await authenticatedHome(); return NextResponse.redirect(url)
    }
  }
  return response
}
