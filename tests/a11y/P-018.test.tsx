import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';
import PageNotFound from '../../src/client/pages/PageNotFound';
import * as AuthContext from '../../src/client/components/AuthContext';

vi.mock('../../src/client/components/AuthContext', async () => {
  const actual = await vi.importActual('../../src/client/components/AuthContext');
  return {
    ...actual,
    useAuth: vi.fn(),
  };
});

describe('P-018 Page Not Found Page and Elements (T-A11Y-P018, EL-134..EL-137)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders heading and universal return link EL-134 for anonymous visitors', () => {
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      user: null,
      role: 'anonymous',
      loading: false,
      error: null,
      unreadCount: 0,
      login: vi.fn(),
      logout: vi.fn(),
      refreshSession: vi.fn(),
      refreshUnreadCount: vi.fn(),
    });

    render(
      <BrowserRouter>
        <PageNotFound />
      </BrowserRouter>
    );

    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toContain('Page Not Found');

    const el134 = screen.getByTestId('EL-134');
    expect(el134).toBeDefined();
    expect(el134.getAttribute('href')).toBe('/');

    expect(screen.queryByTestId('EL-135')).toBeNull();
    expect(screen.queryByTestId('EL-136')).toBeNull();
    expect(screen.queryByTestId('EL-137')).toBeNull();
  });

  it('renders admin recovery link EL-135 for authenticated admin', () => {
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
      logout: vi.fn(),
      refreshSession: vi.fn(),
      refreshUnreadCount: vi.fn(),
    });

    render(
      <BrowserRouter>
        <PageNotFound />
      </BrowserRouter>
    );

    const el135 = screen.getByTestId('EL-135');
    expect(el135.getAttribute('href')).toBe('/admin');
  });

  it('renders student recovery link EL-136 for authenticated student', () => {
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
      logout: vi.fn(),
      refreshSession: vi.fn(),
      refreshUnreadCount: vi.fn(),
    });

    render(
      <BrowserRouter>
        <PageNotFound />
      </BrowserRouter>
    );

    const el136 = screen.getByTestId('EL-136');
    expect(el136.getAttribute('href')).toBe('/student');
  });

  it('renders reviewer recovery link EL-137 for authenticated reviewer', () => {
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
      logout: vi.fn(),
      refreshSession: vi.fn(),
      refreshUnreadCount: vi.fn(),
    });

    render(
      <BrowserRouter>
        <PageNotFound />
      </BrowserRouter>
    );

    const el137 = screen.getByTestId('EL-137');
    expect(el137.getAttribute('href')).toBe('/reviewer');
  });
});
