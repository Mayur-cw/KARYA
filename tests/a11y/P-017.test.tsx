import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';
import AccessDenied from '../../src/client/pages/AccessDenied';
import * as AuthContext from '../../src/client/components/AuthContext';

vi.mock('../../src/client/components/AuthContext', async () => {
  const actual = await vi.importActual('../../src/client/components/AuthContext');
  return {
    ...actual,
    useAuth: vi.fn(),
  };
});

describe('P-017 Access Denied Page and Elements (T-A11Y-P017, EL-130..EL-133)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders heading and universal return link EL-130 for anonymous visitors', () => {
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
        <AccessDenied />
      </BrowserRouter>
    );

    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toContain('Access Denied');

    const el130 = screen.getByTestId('EL-130');
    expect(el130).toBeDefined();
    expect(el130.getAttribute('href')).toBe('/');

    expect(screen.queryByTestId('EL-131')).toBeNull();
    expect(screen.queryByTestId('EL-132')).toBeNull();
    expect(screen.queryByTestId('EL-133')).toBeNull();
  });

  it('renders admin recovery link EL-131 for authenticated admin', () => {
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
        <AccessDenied />
      </BrowserRouter>
    );

    const el131 = screen.getByTestId('EL-131');
    expect(el131.getAttribute('href')).toBe('/admin');
  });

  it('renders student recovery link EL-132 for authenticated student', () => {
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
        <AccessDenied />
      </BrowserRouter>
    );

    const el132 = screen.getByTestId('EL-132');
    expect(el132.getAttribute('href')).toBe('/student');
  });

  it('renders reviewer recovery link EL-133 for authenticated reviewer', () => {
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
        <AccessDenied />
      </BrowserRouter>
    );

    const el133 = screen.getByTestId('EL-133');
    expect(el133.getAttribute('href')).toBe('/reviewer');
  });
});
