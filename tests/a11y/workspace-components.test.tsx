import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth, SEEDED_ACTORS } from '../../src/client/components/AuthContext';
import { Header } from '../../src/client/components/Header';
import { Dialog } from '../../src/client/components/Dialog';
import { RoleGuard } from '../../src/client/components/RoleGuard';
import { AppErrorBoundary } from '../../src/client/components/AppErrorBoundary';
import { WorkspaceLayout } from '../../src/client/components/WorkspaceLayout';
import { api, setCsrfToken } from '../../src/client/api';
vi.mock('../../src/client/api', () => ({ api: vi.fn(), setCsrfToken: vi.fn() }));
const user = { ...SEEDED_ACTORS[0], departmentId: 'department' };
function AuthHarness() {
  const auth = useAuth();
  const [result, setResult] = React.useState('');
  return <><p data-testid="auth-state">{auth.loading ? 'loading' : `${auth.role}:${auth.unreadCount}:${auth.demoMode}`}</p><p>{auth.error}</p><p>{result}</p><button onClick={() => auth.login(user.id).catch(() => setResult('login rejected'))}>Login</button><button onClick={() => auth.logout().catch(() => setResult('logout rejected'))}>Logout</button><button onClick={() => auth.refreshSession()}>Refresh session</button><Header /></>;
}
function mount() { return render(<MemoryRouter><AuthProvider><AuthHarness /></AuthProvider></MemoryRouter>); }
describe('Workspace sessions and navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api).mockImplementation(async path => path === '/api/notifications/unread-count' ? { count: 3 } : { user: null, csrfToken: '', demoMode: true, demoActors: [user] });
  });
  it('initializes public access, creates a signed-in workspace and refreshes unread count', async () => {
    mount();
    await waitFor(() => expect(screen.getByTestId('auth-state').textContent).toBe('anonymous:0:true'));
    vi.mocked(api).mockImplementation(async (path, options) => path === '/api/notifications/unread-count' ? { count: 3 } : options?.method === 'POST' ? { user, csrfToken: 'signed-token' } : { user, csrfToken: 'signed-token', demoMode: true, demoActors: [user] });
    fireEvent.click(screen.getByText('Login'));
    await waitFor(() => expect(screen.getByTestId('auth-state').textContent).toBe('admin:3:true'));
    expect(setCsrfToken).toHaveBeenCalledWith('signed-token');
    expect(screen.getByRole('navigation', { name: 'Role Navigation' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Workflows' }).getAttribute('href')).toBe('/admin/workflows');
    expect(screen.queryByRole('combobox')).toBeNull();
    fireEvent.click(screen.getByText('Refresh session'));
    await waitFor(() => expect(api).toHaveBeenCalledWith('/api/session'));
  });
  it('preserves the active account and surfaces a rejected logout', async () => {
    vi.mocked(api).mockImplementation(async path => path === '/api/notifications/unread-count' ? { count: 0 } : { user, csrfToken: 'token', demoMode: true, demoActors: [user] });
    mount();
    await waitFor(() => expect(screen.getByTestId('auth-state').textContent).toBe('admin:0:true'));
    vi.mocked(api).mockRejectedValueOnce(new Error('Server unavailable'));
    fireEvent.click(screen.getByText('Logout'));
    await screen.findByText('logout rejected');
    expect(screen.getByText('Server unavailable')).toBeDefined();
    expect(screen.getByTestId('auth-state').textContent).toBe('admin:0:true');
  });
  it('returns to public navigation after a successful logout', async () => {
    vi.mocked(api).mockImplementation(async path => path === '/api/notifications/unread-count' ? { count: 1 } : { user, csrfToken: 'token', demoMode: true, demoActors: [user] });
    mount();
    await waitFor(() => expect(screen.getByTestId('auth-state').textContent).toBe('admin:1:true'));
    vi.mocked(api).mockResolvedValue({ user: null, csrfToken: '', demoMode: true, demoActors: [user] });
    fireEvent.click(screen.getByText('Logout'));
    await waitFor(() => expect(screen.getByTestId('auth-state').textContent).toBe('anonymous:0:true'));
    expect(screen.queryByRole('navigation', { name: 'Role Navigation' })).toBeNull();
    expect(setCsrfToken).toHaveBeenCalledWith(null);
  });
  it('opens the profile menu when clicking avatar and signs out', async () => {
    vi.mocked(api).mockImplementation(async path => path === '/api/notifications/unread-count' ? { count: 0 } : { user, csrfToken: 'token', demoMode: true, demoActors: [user] });
    mount();
    await waitFor(() => expect(screen.getByTestId('auth-state').textContent).toBe('admin:0:true'));

    expect(screen.queryByTestId('profile-signout-btn')).toBeNull();
    const avatarBtn = screen.getByTestId('profile-avatar-btn');
    fireEvent.click(avatarBtn);

    const signoutBtn = screen.getByTestId('profile-signout-btn');
    expect(signoutBtn).toBeDefined();
    expect(screen.getByText('My Account')).toBeDefined();

    vi.mocked(api).mockResolvedValue({ user: null, csrfToken: '', demoMode: true, demoActors: [user] });
    fireEvent.click(signoutBtn);
    await waitFor(() => expect(screen.getByTestId('auth-state').textContent).toBe('anonymous:0:true'));
  });
  it('reports an unavailable server and disables demo access', async () => {
    vi.mocked(api).mockRejectedValue(new Error('Offline'));
    mount();
    await screen.findByText('Unable to connect to KARYA. Check that the server is running.');
    expect(screen.getByTestId('auth-state').textContent).toBe('anonymous:0:false');
  });
  it('reports failed sign-in without granting a role', async () => {
    mount();
    await waitFor(() => expect(screen.getByTestId('auth-state').textContent).toBe('anonymous:0:true'));
    vi.mocked(api).mockRejectedValueOnce(new Error('Demo unavailable'));
    fireEvent.click(screen.getByText('Login'));
    await screen.findByText('login rejected');
    expect(screen.getByText('Demo unavailable')).toBeDefined();
  });
  it('redirects protected pages to sign-in and retains the requested path', async () => {
    render(<MemoryRouter initialEntries={['/admin']}><AuthProvider><Routes><Route path="/admin" element={<RoleGuard allowedRoles={['admin']}><h1>Private</h1></RoleGuard>} /><Route path="/login" element={<h1>Sign-in route</h1>} /></Routes></AuthProvider></MemoryRouter>);
    expect(await screen.findByText('Sign-in route')).toBeDefined();
    expect(screen.queryByText('Private')).toBeNull();
  });
  it('sets the page title and focus when the page becomes available', async () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    render(<MemoryRouter><AuthProvider><WorkspaceLayout><main id="main-content"><h1>Account</h1></main></WorkspaceLayout></AuthProvider></MemoryRouter>);
    await waitFor(() => expect(document.title).toBe('Account · KARYA'));
    expect(document.activeElement?.textContent).toBe('Account');
  });
});

describe('Modal keyboard behavior and recovery', () => {
  it('traps focus, closes with Escape and restores the trigger', async () => {
    const close = vi.fn();
    const trigger = document.createElement('button'); document.body.appendChild(trigger); trigger.focus();
    const { unmount } = render(<Dialog isOpen onClose={close} title="Confirm action"><button>First action</button><button>Last action</button></Dialog>);
    const last = screen.getByText('Last action');
    last.focus(); fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close dialog' }));
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(window, { key: 'Escape' }); expect(close).toHaveBeenCalledOnce();
    unmount(); expect(document.activeElement).toBe(trigger); trigger.remove();
  });
  it('provides a recovery view when a route throws during rendering', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    function BrokenRoute(): React.ReactNode { throw new Error('Route failed'); }
    await act(async () => render(<AppErrorBoundary><BrokenRoute /></AppErrorBoundary>));
    expect(screen.getByRole('button', { name: 'Reload workspace' })).toBeDefined();
    expect(screen.getByRole('alert')).toBeDefined();
  });
});
