import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import React from 'react';
import WorkflowOverview from '../../src/client/pages/WorkflowOverview';
import * as apiModule from '../../src/client/api';

// Mock api
vi.mock('../../src/client/api', () => ({
  api: vi.fn(),
  setCsrfToken: vi.fn(),
}));

describe('P-007 Workflow Overview Page and Elements (T-A11Y-P007, EL-045..EL-050)', () => {
  const mockWorkflow = {
    id: 'wf-overview-123',
    departmentId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
    title: 'Summer Research Internship 2026',
    description: 'Mandatory 10-week summer internship program.',
    status: 'draft',
    version: 1,
    origin: 'ai',
    sourceId: 'src-123',
    deadline: new Date(Date.now() + 86400000).toISOString(),
    fields: [
      { id: 'f-1', name: 'project_title', label: 'Project Title', type: 'text', required: true },
    ],
    stages: [
      { stageIndex: 0, name: 'Faculty Mentor Review', reviewerId: '44444444-4444-4444-4444-444444444444' },
      { stageIndex: 1, name: 'Dean Sanction', reviewerId: '55555555-5555-5555-5555-555555555555' },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockMetrics = {
    totalAssigned: 10,
    totalSubmissions: 5,
    inReview: 3,
    needsChanges: 1,
    approved: 1,
    rejected: 0,
    draft: 0,
    submitted: 0,
    stageBreakdown: [{ stageIndex: 0, pendingCount: 2 }, { stageIndex: 1, pendingCount: 1 }],
    stage0Pending: 2,
    stage1Pending: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiModule.api).mockImplementation((path: string) => {
      if (path === '/api/workflows/wf-overview-123') return Promise.resolve(mockWorkflow);
      if (path === '/api/workflows/wf-overview-123/analytics') return Promise.resolve(mockMetrics);
      if (path === '/api/documents/src-123') {
        return Promise.resolve({ extractedText: 'Sample extracted circular text.' });
      }
      return Promise.resolve({});
    });
  });

  it('renders heading, participation telemetry, and elements EL-045..EL-050', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/admin/workflows/wf-overview-123']}>
          <Routes>
            <Route path="/admin/workflows/:workflowId" element={<WorkflowOverview />} />
          </Routes>
        </MemoryRouter>
      );
    });

    // Heading
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toContain('Summer Research Internship 2026');

    // EL-050 Return to registry
    const el050 = screen.getByTestId('EL-050');
    expect(el050).toBeDefined();
    expect(el050.getAttribute('href')).toBe('/admin/workflows');

    // EL-045 View participation monitor
    const el045 = screen.getByTestId('EL-045');
    expect(el045).toBeDefined();

    // EL-046 Edit unpublished proposal
    const el046 = screen.getByTestId('EL-046');
    expect(el046).toBeDefined();

    // EL-047 View original source
    const el047 = screen.getByTestId('EL-047');
    expect(el047).toBeDefined();

    // EL-048 Export completion CSV
    const el048 = screen.getByTestId('EL-048');
    expect(el048).toBeDefined();

    // EL-049 Archive workflow
    const el049 = screen.getByTestId('EL-049');
    expect(el049).toBeDefined();

    // Telemetry values
    expect(screen.getByText('TOTAL ASSIGNED')).toBeDefined();
    expect(screen.getByText('10')).toBeDefined();
    expect(screen.getByText('5')).toBeDefined(); // submitted
  });

  it('opens source dialog on EL-047 click', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/admin/workflows/wf-overview-123']}>
          <Routes>
            <Route path="/admin/workflows/:workflowId" element={<WorkflowOverview />} />
          </Routes>
        </MemoryRouter>
      );
    });

    const el047 = screen.getByTestId('EL-047');

    await act(async () => {
      fireEvent.click(el047);
    });

    expect(screen.getByText('Ingested Circular Source Text')).toBeDefined();
    expect(screen.getByText('Sample extracted circular text.')).toBeDefined();
  });

  it('handles archive action on EL-049 click', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/admin/workflows/wf-overview-123']}>
          <Routes>
            <Route path="/admin/workflows/:workflowId" element={<WorkflowOverview />} />
          </Routes>
        </MemoryRouter>
      );
    });

    const el049 = screen.getByTestId('EL-049');

    await act(async () => {
      fireEvent.click(el049);
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Reason for archiving'), { target: { value: 'Application window completed' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm archive' }));
    });

    expect(apiModule.api).toHaveBeenCalledWith(
      '/api/workflows/wf-overview-123/archive',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ expectedVersion: 1, reason: 'Application window completed' }),
      })
    );
  });
});
