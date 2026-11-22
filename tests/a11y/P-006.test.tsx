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
      { key: 'project_title', label: 'Project Title', type: 'text', required: true },
    ],
    stages: [
      { stageIndex: 0, label: 'Faculty Review', reviewerId: '44444444-4444-4444-4444-444444444444' },
      { stageIndex: 1, label: 'Dean Sanction', reviewerId: '55555555-5555-5555-5555-555555555555' },
    ],
    uncertainties: [
      { id: 'unc-1', kind: 'deadline', description: 'Unspecified submission time', resolved: false },
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
    expect(headings[0].textContent).toContain('Workflow editor');

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
  async function mountEditor() {
    await act(async () => { render(<MemoryRouter initialEntries={['/admin/workflows/wf-editor-123/edit']}><Routes><Route path="/admin/workflows/:workflowId/edit" element={<WorkflowEditor />} /></Routes></MemoryRouter>); });
  }
  it('adds, edits and removes fields using canonical keys and supported types', async () => {
    await mountEditor();
    await act(async () => { fireEvent.click(screen.getByTestId('EL-034')); });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Field Label *'), { target: { value: 'Start date' } });
      fireEvent.change(screen.getByLabelText('Field Type'), { target: { value: 'date' } });
      fireEvent.click(screen.getByRole('checkbox', { name: 'Mandatory (Applicant must complete)' }));
    });
    await act(async () => { fireEvent.click(screen.getByText('Save Field')); });
    expect(screen.getByText('Start date')).toBeDefined();
    await act(async () => { fireEvent.click(screen.getAllByTestId('EL-035')[1]); });
    await act(async () => { fireEvent.change(screen.getByLabelText('Field Label *'), { target: { value: 'Internship start date' } }); });
    await act(async () => { fireEvent.click(screen.getByText('Save Field')); });
    expect(screen.getByText('Internship start date')).toBeDefined();
    await act(async () => { fireEvent.click(screen.getAllByTestId('EL-037')[1]); });
    expect(screen.queryByText('Internship start date')).toBeNull();
  });
  it('retains local input when a draft save fails, and sends the current version', async () => {
    await mountEditor();
    await act(async () => {
      fireEvent.change(screen.getByTestId('EL-032'), { target: { value: 'Updated internship process' } });
      fireEvent.change(screen.getByTestId('EL-033'), { target: { value: '2026-12-20T17:00' } });
      fireEvent.change(screen.getByTestId('EL-038'), { target: { value: mockUsers[0].id } });
      fireEvent.change(screen.getByTestId('EL-039'), { target: { value: mockUsers[1].id } });
      fireEvent.click(screen.getByTestId('EL-040').querySelector('input')!);
    });
    vi.mocked(apiModule.api).mockRejectedValueOnce(new Error('Version conflict: refresh before saving'));
    await act(async () => { fireEvent.click(screen.getByTestId('EL-042')); });
    expect((screen.getByTestId('EL-032') as HTMLInputElement).value).toBe('Updated internship process');
    expect(screen.getByText('Version conflict: refresh before saving')).toBeDefined();
    const call = vi.mocked(apiModule.api).mock.calls.find(([, options]) => options?.method === 'PATCH');
    const payload = JSON.parse(String(call?.[1]?.body));
    expect(payload.expectedVersion).toBe(1);
    expect(payload.fields[0].key).toBe('project_title');
    expect(payload.stages[0].label).toBe('Faculty Review');
  });
  it('regenerates a proposal with the current version and shows a form preview', async () => {
    await mountEditor();
    await act(async () => { fireEvent.click(screen.getByTestId('EL-030')); });
    expect(apiModule.api).toHaveBeenCalledWith('/api/workflows/wf-editor-123/propose', { method: 'POST', body: JSON.stringify({ expectedVersion: 1 }) });
    await act(async () => { fireEvent.click(screen.getByTestId('EL-043')); });
    expect(screen.getByRole('dialog')).toBeDefined();
    await act(async () => { fireEvent.click(screen.getByText('Close Preview')); });
    expect(screen.queryByRole('dialog')).toBeNull();
    await act(async () => { fireEvent.click(screen.getByTestId('EL-031')); });
    expect(screen.getByText(/Switched to manual workflow configuration mode/)).toBeDefined();
  });

});
