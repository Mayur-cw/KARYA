import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';
import ReviewerInbox from '../../src/client/pages/ReviewerInbox';
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

describe('P-012 Reviewer Inbox Page and Elements (T-A11Y-P012, EL-086..EL-094)', () => {
  const mockLogout = vi.fn().mockResolvedValue(undefined);

  const mockSubmissions = [
    {
      id: 'sub-rev-1',
      workflowId: 'wf-1',
      studentId: '22222222-2222-2222-2222-222222222222',
      studentName: 'Aarav Patel',
      studentEmail: 'aarav@karya.local',
      workflowTitle: 'Summer Internship 2026',
      status: 'submitted',
      currentStageIndex: 0,
      submittedAt: new Date(Date.now() - 3600000).toISOString(),
      createdAt: new Date(Date.now() - 7200000).toISOString(),
    },
    {
      id: 'sub-rev-2',
      workflowId: 'wf-2',
      studentId: '33333333-3333-3333-3333-333333333333',
      studentName: 'Bhavna Sharma',
      studentEmail: 'bhavna@karya.local',
      workflowTitle: 'Research Fellowship',
      status: 'needs_changes',
      currentStageIndex: 0,
      submittedAt: new Date(Date.now() - 10000000).toISOString(),
      createdAt: new Date(Date.now() - 20000000).toISOString(),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
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
      unreadCount: 2,
      login: vi.fn(),
      logout: mockLogout,
      refreshSession: vi.fn(),
      refreshUnreadCount: vi.fn(),
    });

    vi.mocked(apiModule.api).mockImplementation((path: string) => {
      if (path === '/api/submissions') {
        return Promise.resolve({ items: mockSubmissions });
      }
      return Promise.resolve({});
    });
  });

  it('renders heading, telemetry metrics, and elements EL-086..EL-094', async () => {
    await act(async () => {
      render(
        <BrowserRouter>
          <ReviewerInbox />
        </BrowserRouter>
      );
    });

    // Heading
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toContain('Reviewer Inbox');

    // EL-091 Open notifications
    const el091 = screen.getByTestId('EL-091');
    expect(el091.getAttribute('href')).toBe('/notifications');

    // EL-092 My account
    const el092 = screen.getByTestId('EL-092');
    expect(el092.getAttribute('href')).toBe('/account');

    // EL-093 Logout
    const el093 = screen.getByTestId('EL-093');
    expect(el093).toBeDefined();

    // EL-094 Refresh assigned queue
    const el094 = screen.getByTestId('EL-094');
    expect(el094).toBeDefined();

    // EL-088 Search assigned applicant
    const el088 = screen.getByTestId('EL-088');
    expect(el088).toBeDefined();

    // EL-087 Filter stage status
    const el087 = screen.getByTestId('EL-087');
    expect(el087).toBeDefined();

    // EL-086 Evaluate action link
    const el086List = screen.getAllByTestId('EL-086');
    expect(el086List.length).toBeGreaterThanOrEqual(1);
    expect(el086List[0].getAttribute('href')).toBe('/reviewer/submissions/sub-rev-1');

    // Pagination controls EL-089 & EL-090
    expect(screen.getByTestId('EL-089')).toBeDefined();
    expect(screen.getByTestId('EL-090')).toBeDefined();
  });

  it('filters review queue by search query and stage status (EL-087, EL-088)', async () => {
    await act(async () => {
      render(
        <BrowserRouter>
          <ReviewerInbox />
        </BrowserRouter>
      );
    });

    const searchInput = screen.getByTestId('EL-088');
    const statusSelect = screen.getByTestId('EL-087');

    // Search for 'Bhavna'
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'Bhavna' } });
    });

    expect(screen.getByText('Bhavna Sharma')).toBeDefined();
    expect(screen.queryByText('Aarav Patel')).toBeNull();

    // Clear search and filter by 'needs_changes'
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: '' } });
      fireEvent.change(statusSelect, { target: { value: 'needs_changes' } });
    });

    expect(screen.getByText('Bhavna Sharma')).toBeDefined();
    expect(screen.queryByText('Aarav Patel')).toBeNull();
  });

  it('handles refresh (EL-094) and logout (EL-093)', async () => {
    await act(async () => {
      render(
        <BrowserRouter>
          <ReviewerInbox />
        </BrowserRouter>
      );
    });

    const refreshBtn = screen.getByTestId('EL-094');
    const logoutBtn = screen.getByTestId('EL-093');

    await act(async () => {
      fireEvent.click(refreshBtn);
    });
    expect(apiModule.api).toHaveBeenCalledWith('/api/submissions');

    await act(async () => {
      fireEvent.click(logoutBtn);
    });
    expect(mockLogout).toHaveBeenCalled();
  });
});
