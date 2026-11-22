import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';
import StudentProcessHub from '../../src/client/pages/StudentProcessHub';
import * as AuthContext from '../../src/client/components/AuthContext';
import * as apiModule from '../../src/client/api';

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
  api: vi.fn(),
  setCsrfToken: vi.fn(),
}));

describe('P-009 Student Process Hub Page and Elements (T-A11Y-P009, EL-059..EL-065)', () => {
  const mockLogout = vi.fn().mockResolvedValue(undefined);

  const mockWorkflows = [
    {
      id: 'wf-stu-1',
      departmentId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      title: 'Summer Internship 2026',
      description: 'Departmental internship requirements',
      status: 'published',
      deadline: new Date(Date.now() + 86400000).toISOString(),
    },
    {
      id: 'wf-stu-2',
      departmentId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      title: 'Minor Project Proposal',
      description: 'Final year minor project',
      status: 'published',
      deadline: new Date(Date.now() + 86400000).toISOString(),
    },
  ];

  const mockSubmissions = [
    {
      id: 'sub-stu-1',
      workflowId: 'wf-stu-1',
      studentId: '22222222-2222-2222-2222-222222222222',
      status: 'submitted',
      currentStageIndex: 0,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
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
      unreadCount: 1,
      login: vi.fn(),
      logout: mockLogout,
      refreshSession: vi.fn(),
      refreshUnreadCount: vi.fn(),
    });

    vi.mocked(apiModule.api).mockImplementation((path: string) => {
      if (path === '/api/workflows') return Promise.resolve({ items: mockWorkflows });
      if (path === '/api/submissions') return Promise.resolve({ items: mockSubmissions });
      return Promise.resolve({});
    });
  });

  it('renders heading, telemetry, cards, and elements EL-059..EL-065', async () => {
    await act(async () => {
      render(
        <BrowserRouter>
          <StudentProcessHub />
        </BrowserRouter>
      );
    });

    // Heading
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toContain('My process hub');

    // EL-062 My notifications
    const el062 = screen.getByTestId('EL-062');
    expect(el062).toBeDefined();
    expect(el062.getAttribute('href')).toBe('/notifications');

    // EL-063 My account
    const el063 = screen.getByTestId('EL-063');
    expect(el063).toBeDefined();
    expect(el063.getAttribute('href')).toBe('/account');

    // EL-064 Logout
    const el064 = screen.getByTestId('EL-064');
    expect(el064).toBeDefined();

    // EL-061 Filter status select
    const el061 = screen.getByTestId('EL-061');
    expect(el061).toBeDefined();

    // EL-065 Refresh assigned processes
    const el065 = screen.getByTestId('EL-065');
    expect(el065).toBeDefined();

    // EL-060 Open existing submission for wf-stu-1
    const el060 = screen.getByTestId('EL-060');
    expect(el060).toBeDefined();
    expect(el060.getAttribute('href')).toBe('/student/submissions/sub-stu-1');

    // EL-059 Open assigned process for unstarted wf-stu-2
    const el059 = screen.getByTestId('EL-059');
    expect(el059).toBeDefined();
    expect(el059.getAttribute('href')).toBe('/student/workflows/wf-stu-2');
  });

  it('filters processes by status (EL-061)', async () => {
    await act(async () => {
      render(
        <BrowserRouter>
          <StudentProcessHub />
        </BrowserRouter>
      );
    });

    const filterSelect = screen.getByTestId('EL-061');

    // Filter to 'submitted'
    await act(async () => {
      fireEvent.change(filterSelect, { target: { value: 'submitted' } });
    });

    expect(screen.getByText('Summer Internship 2026')).toBeDefined();
    expect(screen.queryByText('Minor Project Proposal')).toBeNull();
  });

  it('handles refresh (EL-065) and logout (EL-064)', async () => {
    await act(async () => {
      render(
        <BrowserRouter>
          <StudentProcessHub />
        </BrowserRouter>
      );
    });

    const refreshBtn = screen.getByTestId('EL-065');
    const logoutBtn = screen.getByTestId('EL-064');

    await act(async () => {
      fireEvent.click(refreshBtn);
    });
    expect(apiModule.api).toHaveBeenCalledWith('/api/workflows');

    await act(async () => {
      fireEvent.click(logoutBtn);
    });
    expect(mockLogout).toHaveBeenCalled();
  });
});
