import { createPoolApiHandlers } from '@proxies-sx/pool-portal-react/server';
import { auth } from '@/lib/auth';
import { proxies } from '@/lib/proxies';
import { queryOne } from '@/lib/db';

/**
 * Next.js App Router handler: mounts the Pool Portal API underneath
 * /api/pool/... . The component in the dashboard calls /api/pool/me,
 * /api/pool/stock, /api/pool/incidents, /api/pool/regenerate.
 */
export const { GET, POST } = createPoolApiHandlers({
  proxies,

  async getSessionUserId() {
    const session = await auth();
    const id = (session?.user as { id?: string } | undefined)?.id;
    return id ?? null;
  },

  async getUserKeyId(userId) {
    const row = await queryOne<{ pak_key_id: string | null }>(
      'SELECT pak_key_id FROM customers WHERE user_id = $1',
      [Number(userId)],
    );
    return row?.pak_key_id ?? null;
  },

  async onAudit(event) {
    // Keep a small local trail of write events.
    const { query } = await import('@/lib/db');
    await query(
      'INSERT INTO audit_log (user_id, event_type, metadata) VALUES ($1, $2, $3)',
      [Number(event.userId), event.type, { keyId: event.keyId ?? null }],
    );
  },
});
