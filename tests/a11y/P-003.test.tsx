import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';
import AdminCommandCenter from '../../src/client/pages/AdminCommandCenter';
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

describe('P-003 Administration Command Center (T-A11Y-P003, EL-009..EL-015)', () => {
  const mockLogout = vi.fn().mockResolvedValue(undefined);

  const mockWorkflows = [
    {
      id: 'wf-test-1',
      departmentId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      title: 'Summer Research Internship 2026',
      description: 'Departmental internship requirements',
      status: 'published',
      deadlinePolicy: {
        initialDeadline: new Date(Date.now() + 86400000).toISOString(),
        allowLateResubmissions: true,
      },
      stages: [
        { stageIndex: 0, title: 'Faculty Review', assignedReviewerId: '44444444-4444-4444-4444-444444444444' },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'wf-test-2',
      departmentId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      title: 'Unfinished Draft Internship',
      description: 'Draft circular',
      status: 'draft',
      deadlinePolicy: {
        initialDeadline: new Date(Date.now() + 86400000).toISOString(),
        allowLateResubmissions: false,
      },
      stages: [
        { stageIndex: 0, title: 'Stage 0', assignedReviewerId: '' }, // unassigned -> stalled
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
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
      unreadCount: 2,
      login: vi.fn(),
      logout: mockLogout,
      refreshSession: vi.fn(),
      refreshUnreadCount: vi.fn(),
    });

    vi.mocked(apiModule.api).mockResolvedValue(mockWorkflows);
  });

  it('renders command center with stats, action strip, and elements EL-009..EL-015', async () => {
    await act(async () => {
      render(
        <BrowserRouter>
          <AdminCommandCenter />
        </BrowserRouter>
      );
    });

    // Heading
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toContain('Command Center');

    // EL-009 View all workflows
    const el009 = screen.getByTestId('EL-009');
    expect(el009).toBeDefined();
    expect(el009.getAttribute('href')).toBe('/admin/workflows');

    // EL-010 Create from instruction
    const el010 = screen.getByTestId('EL-010');
    expect(el010).toBeDefined();

    // EL-011 Inspect audit events
    const el011 = screen.getByTestId('EL-011');
    expect(el011).toBeDefined();
    expect(el011.getAttribute('href')).toBe('/admin/audit');

    // EL-012 Open notifications
    const el012 = screen.getByTestId('EL-012');
    expect(el012).toBeDefined();
    expect(el012.getAttribute('href')).toBe('/notifications');

    // EL-013 My account
    const el013 = screen.getByTestId('EL-013');
    expect(el013).toBeDefined();
    expect(el013.getAttribute('href')).toBe('/account');

    // EL-014 Logout
    const el014 = screen.getByTestId('EL-014');
    expect(el014).toBeDefined();

    // EL-015 Refresh derived metrics
    const el015 = screen.getByTestId('EL-015');
    expect(el015).toBeDefined();

    // Live Metrics check
    expect(screen.getByText('TOTAL WORKFLOWS')).toBeDefined();
    expect(screen.getByText('2')).toBeDefined(); // 2 total workflows
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1);

    // Workflows rendered
    expect(screen.getByText('Summer Research Internship 2026')).toBeDefined();
    expect(screen.getAllByText('Unfinished Draft Internship').length).toBe(2);
  });

  it('handles refresh button EL-015 and calls api again', async () => {
    await act(async () => {
      render(
        <BrowserRouter>
          <AdminCommandCenter />
        </BrowserRouter>
      );
    });

    const el015 = screen.getByTestId('EL-015');

    await act(async () => {
      fireEvent.click(el015);
    });

    expect(apiModule.api).toHaveBeenCalledWith('/api/workflows');
    expect(screen.getByText(/Dashboard refreshed from live record totals/i)).toBeDefined();
  });

  it('handles logout button EL-014', async () => {
    await act(async () => {
      render(
        <BrowserRouter>
          <AdminCommandCenter />
        </BrowserRouter>
      );
    });

    const el014 = screen.getByTestId('EL-014');

    await act(async () => {
      fireEvent.click(el014);
    });

    expect(mockLogout).toHaveBeenCalled();
  });
});
