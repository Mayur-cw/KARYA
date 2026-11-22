import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';
import AuditExplorer from '../../src/client/pages/AuditExplorer';
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

describe('P-016 Audit Explorer Page and Elements (T-A11Y-P016, EL-124..EL-129)', () => {
  const mockWorkflows = [
    { id: 'wf-101', title: 'Summer Internship 2026' },
    { id: 'wf-102', title: 'Minor Project 2026' },
  ];

  const mockAuditLogs = [
    {
      id: 'audit-log-1',
      departmentId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      workflowId: 'wf-101',
      actorId: '11111111-1111-1111-1111-111111111111',
      actorRole: 'admin',
      event: 'workflow_published',
      targetEntity: 'Workflow',
      targetId: 'wf-101',
      details: { version: 1, title: 'Summer Internship 2026' },
      timestamp: new Date().toISOString(),
    },
    {
      id: 'audit-log-2',
      departmentId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      workflowId: 'wf-101',
      actorId: '22222222-2222-2222-2222-222222222222',
      actorRole: 'student',
      event: 'submission_submitted',
      targetEntity: 'Submission',
      targetId: 'sub-101',
      details: { revision: 1 },
      timestamp: new Date(Date.now() - 3600000).toISOString(),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
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

    vi.mocked(apiModule.api).mockImplementation((path: string) => {
      if (path === '/api/workflows') {
        return Promise.resolve({ items: mockWorkflows });
      }
      if (path.startsWith('/api/audit')) {
        return Promise.resolve({
          items: mockAuditLogs,
          total: 25,
          page: 1,
          limit: 10,
        });
      }
      return Promise.resolve({});
    });
  });

  it('renders heading, back link EL-129, and controls EL-124..EL-128', async () => {
    await act(async () => {
      render(
        <BrowserRouter>
          <AuditExplorer />
        </BrowserRouter>
      );
    });

    // Heading
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toContain('Audit Explorer');

    // EL-129 Back to administration
    const el129 = screen.getByTestId('EL-129');
    expect(el129.getAttribute('href')).toBe('/admin');

    // EL-124 Filter by workflow
    const el124 = screen.getByTestId('EL-124');
    expect(el124).toBeDefined();

    // EL-125 Filter by actor
    const el125 = screen.getByTestId('EL-125');
    expect(el125).toBeDefined();

    // EL-126 Filter by event type
    const el126 = screen.getByTestId('EL-126');
    expect(el126).toBeDefined();

    // EL-127 Refresh audit records
    const el127 = screen.getByTestId('EL-127');
    expect(el127).toBeDefined();

    // EL-128 Next audit page
    const el128 = screen.getByTestId('EL-128');
    expect(el128).toBeDefined();
    expect((el128 as HTMLButtonElement).disabled).toBe(false);
  });

  it('filters by workflow and actor, and advances page (EL-124, EL-125, EL-128)', async () => {
    await act(async () => {
      render(
        <BrowserRouter>
          <AuditExplorer />
        </BrowserRouter>
      );
    });

    const el124 = screen.getByTestId('EL-124');
    const el125 = screen.getByTestId('EL-125');
    const el128 = screen.getByTestId('EL-128');

    // Filter by workflow
    await act(async () => {
      fireEvent.change(el124, { target: { value: 'wf-101' } });
    });
    expect(apiModule.api).toHaveBeenCalledWith(expect.stringContaining('workflowId=wf-101'));

    // Filter by actor
    await act(async () => {
      fireEvent.change(el125, { target: { value: '22222222' } });
    });
    expect(apiModule.api).toHaveBeenCalledWith(expect.stringContaining('actorId=22222222'));

    // Advance page
    await act(async () => {
      fireEvent.click(el128);
    });
    expect(apiModule.api).toHaveBeenCalledWith(expect.stringContaining('page=2'));
  });

  it('handles refresh (EL-127)', async () => {
    await act(async () => {
      render(
        <BrowserRouter>
          <AuditExplorer />
        </BrowserRouter>
      );
    });

    const el127 = screen.getByTestId('EL-127');
    await act(async () => {
      fireEvent.click(el127);
    });
    expect(apiModule.api).toHaveBeenCalledWith(expect.stringContaining('/api/audit'));
  });
});
