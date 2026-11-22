import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import React from 'react';
import ProcessRequirements from '../../src/client/pages/ProcessRequirements';
import * as apiModule from '../../src/client/api';

// Mock api
vi.mock('../../src/client/api', () => ({
  api: vi.fn(),
  setCsrfToken: vi.fn(),
}));

describe('P-010 Process Requirements & Start Page (T-A11Y-P010, EL-066..EL-068)', () => {
  const mockWorkflow = {
    id: 'wf-req-123',
    departmentId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
    title: 'Summer Research Internship 2026',
    description: 'Mandatory internship application guidelines.',
    status: 'published',
    deadline: new Date(Date.now() + 86400000).toISOString(),
    fields: [
      { id: 'f-1', name: 'project_title', label: 'Internship Project Title', type: 'text', required: true },
      { id: 'f-2', name: 'offer_letter', label: 'Company Offer Letter (PDF)', type: 'file', required: true },
    ],
    stages: [
      { stageIndex: 0, name: 'Faculty Mentor Review' },
      { stageIndex: 1, name: 'Dean Institutional Sanction' },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiModule.api).mockResolvedValue(mockWorkflow);
  });

  it('renders heading, requirements, and elements EL-066..EL-068', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/student/workflows/wf-req-123']}>
          <Routes>
            <Route path="/student/workflows/:workflowId" element={<ProcessRequirements />} />
          </Routes>
        </MemoryRouter>
      );
    });

    // Heading
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toContain('Summer Research Internship 2026');

    // EL-068 Back link
    const el068 = screen.getByTestId('EL-068');
    expect(el068).toBeDefined();
    expect(el068.getAttribute('href')).toBe('/student');

    // EL-066 View dynamic required fields
    const el066 = screen.getByTestId('EL-066');
    expect(el066).toBeDefined();

    // EL-067 Start my application button
    const el067 = screen.getByTestId('EL-067');
    expect(el067).toBeDefined();
  });

  it('expands dynamic fields when EL-066 is clicked', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/student/workflows/wf-req-123']}>
          <Routes>
            <Route path="/student/workflows/:workflowId" element={<ProcessRequirements />} />
          </Routes>
        </MemoryRouter>
      );
    });

    const el066 = screen.getByTestId('EL-066');

    await act(async () => {
      fireEvent.click(el066);
    });

    expect(screen.getByText('Internship Project Title')).toBeDefined();
    expect(screen.getByText('Company Offer Letter (PDF)')).toBeDefined();
  });

  it('calls EP-023 when EL-067 is clicked to start application', async () => {
    vi.mocked(apiModule.api).mockImplementation((path: string) => {
      if (path === '/api/workflows/wf-req-123') return Promise.resolve(mockWorkflow);
      if (path === '/api/workflows/wf-req-123/submissions') return Promise.resolve({ id: 'sub-new-123' });
      return Promise.resolve({});
    });

    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/student/workflows/wf-req-123']}>
          <Routes>
            <Route path="/student/workflows/:workflowId" element={<ProcessRequirements />} />
          </Routes>
        </MemoryRouter>
      );
    });

    const el067 = screen.getByTestId('EL-067');

    await act(async () => {
      fireEvent.click(el067);
    });

    expect(apiModule.api).toHaveBeenCalledWith(
      '/api/workflows/wf-req-123/submissions',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
