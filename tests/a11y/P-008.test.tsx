import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import React from 'react';
import ProcessMonitor from '../../src/client/pages/ProcessMonitor';
import * as apiModule from '../../src/client/api';

// Mock api
vi.mock('../../src/client/api', () => ({
  api: vi.fn(),
  setCsrfToken: vi.fn(),
}));

describe('P-008 Process Monitor Page and Elements (T-A11Y-P008, EL-051..EL-058)', () => {
  const mockParticipants = [
    {
      studentId: '22222222-2222-2222-2222-222222222222',
      studentName: 'Aarav Patel',
      studentEmail: 'student.a@karya.local',
      assignedAt: new Date().toISOString(),
      submissionId: 'sub-aarav-123',
      submissionStatus: 'submitted',
      submittedAt: new Date().toISOString(),
    },
    {
      studentId: '33333333-3333-3333-3333-333333333333',
      studentName: 'Bhavya Singh',
      studentEmail: 'student.b@karya.local',
      assignedAt: new Date().toISOString(),
      submissionId: null,
      submissionStatus: 'unstarted',
    },
  ];

  const mockMetrics = {
    totalAssigned: 2,
    totalSubmissions: 1,
    inReview: 1,
    needsChanges: 0,
    approved: 0,
    rejected: 0,
    stage0Pending: 1,
    stage1Pending: 0,
  };

  const mockUsers = [
    { id: '22222222-2222-2222-2222-222222222222', name: 'Aarav Patel', email: 'student.a@karya.local', role: 'student' },
    { id: '33333333-3333-3333-3333-333333333333', name: 'Bhavya Singh', email: 'student.b@karya.local', role: 'student' },
    { id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', name: 'Chetan Sharma', email: 'student.c@karya.local', role: 'student' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiModule.api).mockImplementation((path: string) => {
      if (path === '/api/workflows/wf-mon-123') {
        return Promise.resolve({ title: 'Internship 2026' });
      }
      if (path === '/api/workflows/wf-mon-123/assignees') {
        return Promise.resolve(mockParticipants);
      }
      if (path === '/api/workflows/wf-mon-123/metrics') {
        return Promise.resolve(mockMetrics);
      }
      if (path === '/api/users') {
        return Promise.resolve(mockUsers);
      }
      return Promise.resolve({});
    });
  });

  it('renders heading, telemetry, table, and elements EL-051..EL-058', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/admin/workflows/wf-mon-123/monitor']}>
          <Routes>
            <Route path="/admin/workflows/:workflowId/monitor" element={<ProcessMonitor />} />
          </Routes>
        </MemoryRouter>
      );
    });

    // Heading
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toContain('Process Monitor: Internship 2026');

    // EL-058 Back link
    const el058 = screen.getByTestId('EL-058');
    expect(el058).toBeDefined();

    // EL-057 Add recipient button
    const el057 = screen.getByTestId('EL-057');
    expect(el057).toBeDefined();

    // EL-054 Refresh analytics button
    const el054 = screen.getByTestId('EL-054');
    expect(el054).toBeDefined();

    // EL-056 Export process CSV button
    const el056 = screen.getByTestId('EL-056');
    expect(el056).toBeDefined();

    // EL-051 Search participants input
    const el051 = screen.getByTestId('EL-051');
    expect(el051).toBeDefined();

    // EL-053 Filter completion status select
    const el053 = screen.getByTestId('EL-053');
    expect(el053).toBeDefined();

    // EL-055 Open participant submission (for Aarav who has submission)
    const el055 = screen.getByTestId('EL-055');
    expect(el055).toBeDefined();

    // EL-052 Revoke unstarted assignment (for Bhavya who is unstarted)
    const el052 = screen.getByTestId('EL-052');
    expect(el052).toBeDefined();
  });

  it('filters participants by search query (EL-051)', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/admin/workflows/wf-mon-123/monitor']}>
          <Routes>
            <Route path="/admin/workflows/:workflowId/monitor" element={<ProcessMonitor />} />
          </Routes>
        </MemoryRouter>
      );
    });

    const searchInput = screen.getByTestId('EL-051');

    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'Bhavya' } });
    });

    expect(screen.getByText('Bhavya Singh')).toBeDefined();
    expect(screen.queryByText('Aarav Patel')).toBeNull();
  });

  it('handles revoking unstarted assignment (EL-052)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/admin/workflows/wf-mon-123/monitor']}>
          <Routes>
            <Route path="/admin/workflows/:workflowId/monitor" element={<ProcessMonitor />} />
          </Routes>
        </MemoryRouter>
      );
    });

    const revokeBtn = screen.getByTestId('EL-052');

    await act(async () => {
      fireEvent.click(revokeBtn);
    });

    expect(apiModule.api).toHaveBeenCalledWith(
      '/api/workflows/wf-mon-123/assignees/33333333-3333-3333-3333-333333333333',
      { method: 'DELETE' }
    );
  });
});
