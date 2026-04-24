import NextAuth, { type NextAuthConfig } from 'next-auth';
import Nodemailer from 'next-auth/providers/nodemailer';
import PostgresAdapter from '@auth/pg-adapter';
import { pool } from './db';

const hasSmtpConfig = Boolean(process.env.EMAIL_SERVER_HOST && process.env.EMAIL_FROM);

/**
 * NextAuth (Auth.js v5) configuration.
 *
 * Strategy:
 *   - Database sessions (not JWT) — survives signouts via session table
 *   - Magic-link email via Nodemailer (any SMTP server works)
 *   - Dev fallback: when SMTP isn't configured, print the login link to
 *     the server console so you can click through without setting up email
 */
const config: NextAuthConfig = {
  adapter: PostgresAdapter(pool),
  trustHost: process.env.AUTH_TRUST_HOST === 'true',
  session: { strategy: 'database' },
  pages: {
    signIn: '/login',
    verifyRequest: '/login?verify=1',
  },
  providers: [
    Nodemailer({
      // Auth.js requires a `server` value even when sendVerificationRequest is
      // overridden. In dev (no SMTP env) we pass a harmless placeholder; the
      // transport is never actually used because sendVerificationRequest logs
      // the link to the server console instead.
      server: hasSmtpConfig
        ? {
            host: process.env.EMAIL_SERVER_HOST as string,
            port: Number(process.env.EMAIL_SERVER_PORT ?? 587),
            auth:
              process.env.EMAIL_SERVER_USER && process.env.EMAIL_SERVER_PASSWORD
                ? {
                    user: process.env.EMAIL_SERVER_USER,
                    pass: process.env.EMAIL_SERVER_PASSWORD,
                  }
                : undefined,
          }
        : { host: '127.0.0.1', port: 25, auth: undefined },
      from: process.env.EMAIL_FROM ?? 'noreply@localhost',
      sendVerificationRequest: hasSmtpConfig
        ? undefined
        : ({ identifier, url }) => {
            console.log(`\n───────────────────────────────────────────────`);
            console.log(`📧 Magic-link login for ${identifier}:`);
            console.log(`   ${url}`);
            console.log(`───────────────────────────────────────────────\n`);
            return Promise.resolve();
          },
    }),
  ],
  callbacks: {
    session({ session, user }) {
      // Expose the numeric users.id to server components via `session.user.id`.
      if (session.user && user) {
        (session.user as { id?: string }).id = user.id;
      }
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(config);
