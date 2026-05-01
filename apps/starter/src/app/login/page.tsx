import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth, signIn } from '@/lib/auth';
import { query } from '@/lib/db';
import { config } from '@/config';

interface PageProps {
  searchParams: Promise<{ verify?: string; next?: string }>;
}

/**
 * Allow-list a `next` query param to same-origin paths only.
 * Blocks open-redirect phishing — `?next=https://evil.example` and
 * `?next=//evil.example` (protocol-relative) both fail and fall back
 * to /dashboard. Accepts only paths starting with a single `/`.
 */
function safeNext(raw: string | undefined): string {
  if (typeof raw !== 'string') return '/dashboard';
  if (!raw.startsWith('/')) return '/dashboard';
  if (raw.startsWith('//')) return '/dashboard';   // protocol-relative
  if (raw.startsWith('/\\')) return '/dashboard';  // backslash variant some browsers normalize
  return raw;
}

export default async function LoginPage({ searchParams }: PageProps) {
  const session = await auth();
  const params = await searchParams;
  const next = safeNext(params.next);
  if (session) {
    redirect(next);
  }

  const verified = params.verify === '1';

  return (
    <div className="max-w-md mx-auto">
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
        <div>
          <h1 className="text-xl font-semibold">Sign in to {config.brand.name}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {verified
              ? 'Check your inbox for a sign-in link.'
              : 'We\'ll email you a one-time sign-in link — no password needed.'}
          </p>
        </div>

        {!verified && (
          <form
            action={async (formData) => {
              'use server';
              const raw = formData.get('email');
              const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
              if (!email) return;

              // Rate limit per-email + per-IP. Caps:
              //   5 magic links per email per hour
              //   20 per IP per hour
              // Tunable: tighten if you see abuse, loosen if you have
              // legitimate users hitting the wall.
              const h = await headers();
              const ip =
                h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                h.get('x-real-ip') ||
                'unknown';

              const [byEmail] = await query<{ count: string }>(
                "SELECT COUNT(*)::text AS count FROM magic_link_sends WHERE email_lower = $1 AND sent_at > NOW() - INTERVAL '1 hour'",
                [email],
              );
              const [byIp] = await query<{ count: string }>(
                "SELECT COUNT(*)::text AS count FROM magic_link_sends WHERE client_ip = $1 AND sent_at > NOW() - INTERVAL '1 hour'",
                [ip],
              );
              if (Number(byEmail?.count ?? 0) >= 5 || Number(byIp?.count ?? 0) >= 20) {
                // Silent fall-through to verify=1 — no error message,
                // matches the behavior on a successful send so attackers
                // can't enumerate which limit they hit.
                redirect('/login?verify=1');
              }

              await query(
                'INSERT INTO magic_link_sends (email_lower, client_ip) VALUES ($1, $2)',
                [email, ip],
              );

              await signIn('nodemailer', {
                email,
                redirectTo: next,
              });
            }}
            className="space-y-3"
          >
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-1">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                autoFocus
                placeholder="you@example.com"
                className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
              />
            </div>
            <button
              type="submit"
              className="w-full px-4 py-2 rounded-md bg-[var(--brand)] text-[var(--brand-fg)] font-medium hover:opacity-90"
            >
              Send sign-in link
            </button>
          </form>
        )}

        {verified && (
          <div className="text-sm text-slate-600 dark:text-slate-400">
            If the link didn't arrive in a minute or two, check your spam folder
            or <a href="/login" className="underline">try again</a>.
          </div>
        )}
      </div>
    </div>
  );
}
