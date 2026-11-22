import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import React from 'react';
import WorkflowEditor from '../../src/client/pages/WorkflowEditor';
import * as apiModule from '../../src/client/api';

// Mock api
vi.mock('../../src/client/api', () => ({
  api: vi.fn(),
  setCsrfToken: vi.fn(),
}));

describe('P-006 Explainable Workflow Editor and Elements (T-A11Y-P006, EL-030..EL-044)', () => {
  const mockWorkflow = {
    id: 'wf-editor-123',
    departmentId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
    title: 'Summer Research Internship 2026',
    description: 'Initial draft description',
    status: 'draft',
    version: 1,
    origin: 'ai',
    deadline: new Date(Date.now() + 86400000).toISOString(),
    fields: [
      { id: 'f-1', name: 'project_title', label: 'Project Title', type: 'text', required: true },
    ],
    stages: [
      { stageIndex: 0, name: 'Faculty Review', reviewerId: '44444444-4444-4444-4444-444444444444' },
      { stageIndex: 1, name: 'Dean Sanction', reviewerId: '55555555-5555-5555-5555-555555555555' },
    ],
    uncertainties: [
      { id: 'unc-1', field: 'deadline', reason: 'Unspecified submission time', resolved: false },
    ],
    sourceDocument: {
      id: 'src-123',
      title: 'circular.pdf',
      extractedLength: 250,
      extractedText: 'Official notification text for internship.',
    },
  };

  const mockUsers = [
    { id: '44444444-4444-4444-4444-444444444444', name: 'Prof. Priya Iyer', email: 'mentor@karya.local', role: 'reviewer' },
    { id: '55555555-5555-5555-5555-555555555555', name: 'Dean R. K. Nair', email: 'dean@karya.local', role: 'reviewer' },
    { id: '22222222-2222-2222-2222-222222222222', name: 'Aarav Patel', email: 'student.a@karya.local', role: 'student' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiModule.api).mockImplementation((path: string) => {
      if (path.startsWith('/api/workflows/wf-editor-123')) {
        return Promise.resolve(mockWorkflow);
      }
      if (path === '/api/users') {
        return Promise.resolve(mockUsers);
      }
      return Promise.resolve({});
    });
  });

  it('renders all 15 elements EL-030..EL-044 and blocks publish when uncertainty is unresolved', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/admin/workflows/wf-editor-123/edit']}>
          <Routes>
            <Route path="/admin/workflows/:workflowId/edit" element={<WorkflowEditor />} />
          </Routes>
        </MemoryRouter>
      );
    });

    // Heading
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toContain('Explainable Workflow Editor');

    // EL-044 Back link
    const el044 = screen.getByTestId('EL-044');
    expect(el044).toBeDefined();

    // EL-043 Preview student form
    const el043 = screen.getByTestId('EL-043');
    expect(el043).toBeDefined();

    // EL-042 Save draft
    const el042 = screen.getByTestId('EL-042');
    expect(el042).toBeDefined();

    // EL-030 Generate proposal
    const el030 = screen.getByTestId('EL-030');
    expect(el030).toBeDefined();

    // EL-031 Choose manual proposal
    const el031 = screen.getByTestId('EL-031');
    expect(el031).toBeDefined();

    // EL-032 Edit workflow title
    const el032 = screen.getByTestId('EL-032') as HTMLInputElement;
    expect(el032).toBeDefined();
    expect(el032.value).toBe('Summer Research Internship 2026');

    // EL-033 Set deadline
    const el033 = screen.getByTestId('EL-033');
    expect(el033).toBeDefined();

    // EL-038 Select faculty mentor
    const el038 = screen.getByTestId('EL-038') as HTMLSelectElement;
    expect(el038.value).toBe('44444444-4444-4444-4444-444444444444');

    // EL-039 Select final approver
    const el039 = screen.getByTestId('EL-039') as HTMLSelectElement;
    expect(el039.value).toBe('55555555-5555-5555-5555-555555555555');

    // EL-040 Select student audience
    const el040 = screen.getByTestId('EL-040');
    expect(el040).toBeDefined();

    // EL-041 Resolve uncertainty button
    const el041 = screen.getByTestId('EL-041');
    expect(el041).toBeDefined();

    // EL-034 Add required form field
    const el034 = screen.getByTestId('EL-034');
    expect(el034).toBeDefined();

    // EL-035 Edit selected form field
    const el035 = screen.getByTestId('EL-035');
    expect(el035).toBeDefined();

    // EL-037 Remove selected form field
    const el037 = screen.getByTestId('EL-037');
    expect(el037).toBeDefined();

    // EL-036 Publish button (BLOCKED because unc-1 is unresolved)
    const el036 = screen.getByTestId('EL-036') as HTMLButtonElement;
    expect(el036.disabled).toBe(true);

    // Resolve the uncertainty via EL-041
    await act(async () => {
      fireEvent.click(el041);
    });

    const confirmResolveBtn = screen.getByText('Confirm Resolution');
    await act(async () => {
      fireEvent.click(confirmResolveBtn);
    });

    // Now all gate requirements are fulfilled! Publish button should be enabled!
    expect(el036.disabled).toBe(false);
  });

  it('publishes workflow when EL-036 is clicked after fulfilling gate', async () => {
    // Keep standard mock behavior

    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/admin/workflows/wf-editor-123/edit']}>
          <Routes>
            <Route path="/admin/workflows/:workflowId/edit" element={<WorkflowEditor />} />
          </Routes>
        </MemoryRouter>
      );
    });

    // Resolve uncertainty
    const el041 = screen.getByTestId('EL-041');
    await act(async () => {
      fireEvent.click(el041);
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Confirm Resolution'));
    });

    const publishBtn = screen.getByTestId('EL-036') as HTMLButtonElement;
    expect(publishBtn.disabled).toBe(false);

    await act(async () => {
      fireEvent.click(publishBtn);
    });

    expect(apiModule.api).toHaveBeenCalledWith(
      '/api/workflows/wf-editor-123/publish',
      expect.objectContaining({
        method: 'POST',
      })
    );
  });
});
