import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';
import Welcome from '../../src/client/pages/Welcome';
import * as AuthContext from '../../src/client/components/AuthContext';

// Mock AuthContext
vi.mock('../../src/client/components/AuthContext', async () => {
  const actual = await vi.importActual('../../src/client/components/AuthContext');
  return {
    ...actual,
    useAuth: vi.fn(),
  };
});

// Mock api
vi.mock('../../src/client/api', () => ({
  api: vi.fn().mockResolvedValue({ status: 'ok' }),
  setCsrfToken: vi.fn(),
}));

describe('P-001 Welcome Page and Elements (T-A11Y-P001, EL-001..EL-005)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly for anonymous user and shows EL-001 and EL-005', async () => {
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

    await act(async () => {
      render(
        <BrowserRouter>
          <Welcome />
        </BrowserRouter>
      );
    });

    // One h1 heading
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toContain('Clear instructions.');

    // EL-001 is visible for anonymous
    const signInBtn = screen.getByTestId('EL-001');
    expect(signInBtn).toBeDefined();

    // EL-005 is visible to all
    const howItWorksBtn = screen.getByTestId('EL-005');
    expect(howItWorksBtn).toBeDefined();

    // EL-002, EL-003, EL-004 are not visible to anonymous
    expect(screen.queryByTestId('EL-002')).toBeNull();
    expect(screen.queryByTestId('EL-003')).toBeNull();
    expect(screen.queryByTestId('EL-004')).toBeNull();

    // Clicking EL-005 opens the dialog
    await act(async () => {
      fireEvent.click(howItWorksBtn);
    });
    expect(screen.getByRole('heading', { name: 'How KARYA works' })).toBeDefined();
    expect(screen.getByText('Define the process')).toBeDefined();
  });

  it('renders EL-002 for admin user', async () => {
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      user: {
        id: '11111111-1111-1111-1111-111111111111',
        email: 'admin@karya.local',
        name: 'Dr. Alok Verma',
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

    await act(async () => {
      render(
        <BrowserRouter>
          <Welcome />
        </BrowserRouter>
      );
    });

    expect(screen.getByTestId('EL-002')).toBeDefined();
    expect(screen.queryByTestId('EL-001')).toBeNull();
    expect(screen.queryByTestId('EL-003')).toBeNull();
    expect(screen.queryByTestId('EL-004')).toBeNull();
  });

  it('renders EL-003 for student user', async () => {
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

    await act(async () => {
      render(
        <BrowserRouter>
          <Welcome />
        </BrowserRouter>
      );
    });

    expect(screen.getByTestId('EL-003')).toBeDefined();
    expect(screen.queryByTestId('EL-001')).toBeNull();
    expect(screen.queryByTestId('EL-002')).toBeNull();
  });

  it('renders EL-004 for reviewer user', async () => {
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      user: {
        id: '44444444-4444-4444-4444-444444444444',
        email: 'mentor@karya.local',
        name: 'Prof. Priya Iyer',
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

    await act(async () => {
      render(
        <BrowserRouter>
          <Welcome />
        </BrowserRouter>
      );
    });

    expect(screen.getByTestId('EL-004')).toBeDefined();
    expect(screen.queryByTestId('EL-001')).toBeNull();
    expect(screen.queryByTestId('EL-002')).toBeNull();
    expect(screen.queryByTestId('EL-003')).toBeNull();
  });
});
