import { beforeEach, describe, expect, it, vi } from 'vitest';
import { safeSignInRedirect } from '../../src/client/pages/DemoSignIn';
import { fetchCollection } from '../../src/client/collections';
import { api } from '../../src/client/api';
vi.mock('../../src/client/api', () => ({ api: vi.fn(), setCsrfToken: vi.fn() }));
describe('Client contract regressions', () => {
  beforeEach(() => vi.clearAllMocks());
  it('keeps login redirects within the selected role and same origin', () => {
    for (const path of ['https://example.com', '//example.com', '/admin', '/studentish', '/student\\example.com', '/student/../admin']) {
      expect(safeSignInRedirect(path, 'student')).toBe('/student');
    }
    expect(safeSignInRedirect('/student/submissions/123?tab=files', 'student')).toBe('/student/submissions/123?tab=files');
    expect(safeSignInRedirect('/notifications', 'reviewer')).toBe('/notifications');
  });
  it('loads every API page before computing client-side counts and filters', async () => {
    vi.mocked(api).mockResolvedValueOnce({ items: [{ id: 'a' }], page: 1, limit: 1, total: 3 }).mockResolvedValueOnce({ items: [{ id: 'b' }], page: 2, limit: 1, total: 3 }).mockResolvedValueOnce({ items: [{ id: 'c' }], page: 3, limit: 1, total: 3 });
    expect(await fetchCollection('/api/workflows?status=published')).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    expect(api).toHaveBeenNthCalledWith(3, '/api/workflows?status=published&page=3&limit=1');
  });
});
