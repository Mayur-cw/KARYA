import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, getCsrfToken, setCsrfToken } from '../../src/client/api';
afterEach(() => { vi.unstubAllGlobals(); setCsrfToken(null); });
describe('API session and failure handling', () => {
  it('sends the current CSRF token for JSON mutations and adopts a rotated token', async () => {
    setCsrfToken('before');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ csrfToken: 'after', ok: true }), { headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    await api('/api/session', { method: 'POST', body: JSON.stringify({ userId: 'seed-user' }) });
    expect(fetchMock).toHaveBeenCalledWith('/api/session', expect.objectContaining({ credentials: 'same-origin', headers: expect.objectContaining({ 'x-csrf-token': 'before', 'Content-Type': 'application/json' }) }));
    expect(getCsrfToken()).toBe('after');
  });
  it('preserves browser multipart headers for uploaded files', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'document' })));
    vi.stubGlobal('fetch', fetchMock);
    const data = new FormData(); data.append('file', new File(['test'], 'note.txt'));
    await api('/api/attachments', { method: 'POST', body: data });
    expect(fetchMock.mock.calls[0][1].headers['Content-Type']).toBeUndefined();
  });
  it('returns typed API errors with the server message and validation details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'VERSION_MISMATCH', message: 'Refresh this record', details: { version: 2 } }), { status: 409 })));
    await expect(api('/api/workflows/1')).rejects.toMatchObject({ status: 409, code: 'VERSION_MISMATCH', message: 'Refresh this record', details: { version: 2 } });
  });
  it('handles no-content responses and non-JSON forbidden errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValueOnce(new Response('Forbidden', { status: 403 })));
    expect(await api('/api/session', { method: 'DELETE' })).toBeUndefined();
    await expect(api('/api/private')).rejects.toBeInstanceOf(ApiError);
  });
});
describe('API response edge cases', () => {
  it('adopts a rotated response-header token and preserves explicitly supplied headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { headers: { 'x-csrf-token': 'rotated-header' } }));
    vi.stubGlobal('fetch', fetchMock);
    await api('/api/workflows', { method: 'PATCH', body: '{}', headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'local-test' } });
    expect(getCsrfToken()).toBe('rotated-header');
    expect(fetchMock.mock.calls[0][1].headers['X-Request-Id']).toBe('local-test');
  });
  it('uses safe fallback messages when an unavailable endpoint returns no JSON error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('missing', { status: 404 })).mockResolvedValueOnce(new Response('unavailable', { status: 503 })));
    await expect(api('/api/missing')).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND', message: 'Request failed' });
    await expect(api('/api/unavailable')).rejects.toMatchObject({ status: 503, code: 'REQUEST_FAILED', message: 'Request failed' });
  });
});
