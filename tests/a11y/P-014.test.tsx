import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';
import Notifications from '../../src/client/pages/Notifications';
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

describe('P-014 Notifications Page and Elements (T-A11Y-P014, EL-107..EL-116)', () => {
  const mockNotifications = [
    {
      id: 'notif-1',
      recipientId: '22222222-2222-2222-2222-222222222222',
      eventType: 'submission_needs_changes',
      title: 'Revision Requested by Mentor',
      body: 'Prof. Ramesh Kumar requested updates on your internship application.',
      targetRef: 'sub-rev-101',
      readAt: null,
      dismissedAt: null,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'notif-2',
      recipientId: '22222222-2222-2222-2222-222222222222',
      eventType: 'workflow_published',
      title: 'New Workflow Published',
      body: 'Department has opened Summer Internship 2026.',
      targetRef: 'wf-internship-1',
      readAt: new Date(Date.now() - 3600000).toISOString(),
      dismissedAt: null,
      createdAt: new Date(Date.now() - 7200000).toISOString(),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders student notifications, back link EL-115, and elements EL-107..EL-113', async () => {
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
      logout: vi.fn(),
      refreshSession: vi.fn(),
      refreshUnreadCount: vi.fn(),
    });

    vi.mocked(apiModule.api).mockImplementation((path: string) => {
      if (path.startsWith('/api/notifications')) {
        return Promise.resolve({
          items: mockNotifications,
          unreadCount: 1,
          total: 2,
          page: 1,
          limit: 20,
        });
      }
      return Promise.resolve({});
    });

    await act(async () => {
      render(
        <BrowserRouter>
          <Notifications />
        </BrowserRouter>
      );
    });

    // Heading
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toContain('Notifications');

    // EL-115 Return to student workspace
    const el115 = screen.getByTestId('EL-115');
    expect(el115).toBeDefined();
    expect(el115.getAttribute('href')).toBe('/student');

    // EL-107 Filter unread notices
    const el107 = screen.getByTestId('EL-107');
    expect(el107).toBeDefined();

    // EL-108 Refresh notifications
    const el108 = screen.getByTestId('EL-108');
    expect(el108).toBeDefined();

    // EL-109 Open student notification target
    const el109List = screen.getAllByTestId('EL-109');
    expect(el109List.length).toBeGreaterThanOrEqual(1);

    // EL-112 Mark notification as read
    const el112 = screen.getByTestId('EL-112');
    expect(el112).toBeDefined();

    // EL-113 Dismiss notification
    const el113List = screen.getAllByTestId('EL-113');
    expect(el113List.length).toBeGreaterThanOrEqual(1);

    // Mark as read action
    await act(async () => {
      fireEvent.click(el112);
    });
    expect(apiModule.api).toHaveBeenCalledWith(
      '/api/notifications/notif-1',
      expect.objectContaining({
        method: 'PATCH',
      })
    );
  });

  it('renders reviewer back link EL-116 and reviewer target EL-110 for reviewer role', async () => {
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
      unreadCount: 1,
      login: vi.fn(),
      logout: vi.fn(),
      refreshSession: vi.fn(),
      refreshUnreadCount: vi.fn(),
    });

    vi.mocked(apiModule.api).mockResolvedValue({
      items: [
        {
          id: 'notif-rev-1',
          recipientId: '44444444-4444-4444-4444-444444444444',
          eventType: 'review_assigned',
          title: 'New Submission Awaiting Review',
          body: 'Aarav Patel has submitted an application for Stage 0 review.',
          targetRef: 'sub-rev-101',
          readAt: null,
          dismissedAt: null,
          createdAt: new Date().toISOString(),
        },
      ],
      unreadCount: 1,
      total: 1,
      page: 1,
      limit: 20,
    });

    await act(async () => {
      render(
        <BrowserRouter>
          <Notifications />
        </BrowserRouter>
      );
    });

    // EL-116
    const el116 = screen.getByTestId('EL-116');
    expect(el116.getAttribute('href')).toBe('/reviewer');

    // EL-110
    const el110 = screen.getByTestId('EL-110');
    expect(el110.getAttribute('href')).toBe('/reviewer/submissions/sub-rev-101');
  });

  it('renders admin back link EL-114 and admin target EL-111 for admin role', async () => {
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

    vi.mocked(apiModule.api).mockResolvedValue({
      items: [
        {
          id: 'notif-adm-1',
          recipientId: '11111111-1111-1111-1111-111111111111',
          eventType: 'workflow_stalled',
          title: 'Process Review Overdue',
          body: 'Workflow Summer Internship 2026 has pending reviews.',
          targetRef: 'wf-internship-1',
          readAt: null,
          dismissedAt: null,
          createdAt: new Date().toISOString(),
        },
      ],
      unreadCount: 0,
      total: 1,
      page: 1,
      limit: 20,
    });

    await act(async () => {
      render(
        <BrowserRouter>
          <Notifications />
        </BrowserRouter>
      );
    });

    // EL-114
    const el114 = screen.getByTestId('EL-114');
    expect(el114.getAttribute('href')).toBe('/admin');

    // EL-111
    const el111 = screen.getByTestId('EL-111');
    expect(el111.getAttribute('href')).toBe('/admin/workflows/wf-internship-1/monitor');
  });
});
