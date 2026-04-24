import { redirect } from 'next/navigation';
import { auth, signIn } from '@/lib/auth';
import { config } from '@/config';

interface PageProps {
  searchParams: Promise<{ verify?: string; next?: string }>;
}

export default async function LoginPage({ searchParams }: PageProps) {
  const session = await auth();
  const params = await searchParams;
  if (session) {
    redirect(params.next ?? '/dashboard');
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
              const email = typeof raw === 'string' ? raw.trim() : '';
              if (!email) return;
              await signIn('nodemailer', {
                email,
                redirectTo: params.next ?? '/dashboard',
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
