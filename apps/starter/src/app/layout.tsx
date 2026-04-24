import type { Metadata } from 'next';
import Link from 'next/link';
import { config } from '@/config';
import { auth, signOut } from '@/lib/auth';
import './globals.css';

export const metadata: Metadata = {
  title: config.brand.name,
  description: config.brand.tagline,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  return (
    <html lang="en">
      <body
        style={{
          ['--brand' as string]: config.brand.primaryColor,
          ['--brand-fg' as string]: '#ffffff',
        } as React.CSSProperties}
      >
        <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="max-w-5xl mx-auto flex items-center justify-between px-4 py-4">
            <Link href="/" className="font-semibold text-lg">
              {config.brand.name}
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              {session?.user ? (
                <>
                  <Link href="/dashboard" className="hover:underline">Dashboard</Link>
                  <form
                    action={async () => {
                      'use server';
                      await signOut({ redirectTo: '/' });
                    }}
                  >
                    <button
                      type="submit"
                      className="text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
                    >
                      Sign out
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <Link href="/#pricing" className="hover:underline">Pricing</Link>
                  <Link
                    href="/login"
                    className="px-3 py-1.5 rounded-md bg-[var(--brand)] text-[var(--brand-fg)] hover:opacity-90"
                  >
                    Sign in
                  </Link>
                </>
              )}
            </nav>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-4 py-10">{children}</main>

        <footer className="border-t border-slate-200 dark:border-slate-800 mt-16">
          <div className="max-w-5xl mx-auto px-4 py-6 text-xs text-slate-500 flex justify-between flex-wrap gap-2">
            <span>© {new Date().getFullYear()} {config.brand.name}</span>
            <span>
              Questions? <a href={`mailto:${config.brand.supportEmail}`} className="underline">{config.brand.supportEmail}</a>
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
