import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';
import MyAccount from '../../src/client/pages/MyAccount';
import * as AuthContext from '../../src/client/components/AuthContext';
import * as apiModule from '../../src/client/api';

vi.mock('../../src/client/components/AuthContext', async () => {
  const actual = await vi.importActual('../../src/client/components/AuthContext');
  return {
    ...actual,
    useAuth: vi.fn(),
  };
});

vi.mock('../../src/client/api', () => ({
  api: vi.fn(),
  setCsrfToken: vi.fn(),
}));

describe('P-015 My Account Page and Elements (T-A11Y-P015, EL-117..EL-123)', () => {
  const mockLogout = vi.fn().mockResolvedValue(undefined);
  const mockRefreshSession = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders student account view with EL-117..EL-120 and back link EL-122', async () => {
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      user: {
        id: '22222222-2222-2222-2222-222222222222',
        email: 'student.a@karya.local',
        name: 'Aarav Patel',
        role: 'student',
        departmentId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      },
      role: 'student',
      loading: false,
      error: null,
      unreadCount: 0,
      login: vi.fn(),
      logout: mockLogout,
      refreshSession: mockRefreshSession,
      refreshUnreadCount: vi.fn(),
    });

    vi.mocked(apiModule.api).mockImplementation((path: string) => {
      if (path === '/api/auth/me') {
        return Promise.resolve({
          user: {
            id: '22222222-2222-2222-2222-222222222222',
            email: 'student.a@karya.local',
            name: 'Aarav Patel',
            role: 'student',
            departmentId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
          },
        });
      }
      return Promise.resolve({});
    });

    await act(async () => {
      render(
        <BrowserRouter>
          <MyAccount />
        </BrowserRouter>
      );
    });

    // Heading
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toContain('My Account');

    // EL-122 Return to student home
    const el122 = screen.getByTestId('EL-122');
    expect(el122.getAttribute('href')).toBe('/student');

    // EL-117 Edit display name
    const el117 = screen.getByTestId('EL-117') as HTMLInputElement;
    expect(el117.value).toBe('Aarav Patel');

    // EL-118 Save profile
    const el118 = screen.getByTestId('EL-118');
    expect(el118).toBeDefined();

    // EL-119 Inspect session
    const el119 = screen.getByTestId('EL-119');
    expect(el119).toBeDefined();

    // EL-120 Logout
    const el120 = screen.getByTestId('EL-120');
    expect(el120).toBeDefined();

    // Edit name and save
    await act(async () => {
      fireEvent.change(el117, { target: { value: 'Aarav Kumar Patel' } });
      fireEvent.click(el118);
    });

    expect(apiModule.api).toHaveBeenCalledWith(
      '/api/users/22222222-2222-2222-2222-222222222222',
      expect.objectContaining({
        method: 'PATCH',
        body: expect.stringContaining('Aarav Kumar Patel'),
      })
    );

    // Inspect session
    await act(async () => {
      fireEvent.click(el119);
    });
    expect(apiModule.api).toHaveBeenCalledWith('/api/auth/me');

    // Logout
    await act(async () => {
      fireEvent.click(el120);
    });
    expect(mockLogout).toHaveBeenCalled();
  });

  it('renders reviewer back link EL-123 for reviewer role', async () => {
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      user: {
        id: '44444444-4444-4444-4444-444444444444',
        email: 'mentor@karya.local',
        name: 'Prof. Ramesh Kumar',
        role: 'reviewer',
        departmentId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      },
      role: 'reviewer',
      loading: false,
      error: null,
      unreadCount: 0,
      login: vi.fn(),
      logout: mockLogout,
      refreshSession: mockRefreshSession,
      refreshUnreadCount: vi.fn(),
    });

    await act(async () => {
      render(
        <BrowserRouter>
          <MyAccount />
        </BrowserRouter>
      );
    });

    const el123 = screen.getByTestId('EL-123');
    expect(el123.getAttribute('href')).toBe('/reviewer');
  });

  it('renders admin back link EL-121 for admin role', async () => {
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      user: {
        id: '11111111-1111-1111-1111-111111111111',
        email: 'admin@karya.local',
        name: 'Dean Sharma',
        role: 'admin',
        departmentId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      },
      role: 'admin',
      loading: false,
      error: null,
      unreadCount: 0,
      login: vi.fn(),
      logout: mockLogout,
      refreshSession: mockRefreshSession,
      refreshUnreadCount: vi.fn(),
    });

    await act(async () => {
      render(
        <BrowserRouter>
          <MyAccount />
        </BrowserRouter>
      );
    });

    const el121 = screen.getByTestId('EL-121');
    expect(el121.getAttribute('href')).toBe('/admin');
  });
});
