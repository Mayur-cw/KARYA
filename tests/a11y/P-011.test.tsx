import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import React from 'react';
import SubmissionWorkspace from '../../src/client/pages/SubmissionWorkspace';
import * as apiModule from '../../src/client/api';

// Mock api
vi.mock('../../src/client/api', () => ({
  api: vi.fn(),
  setCsrfToken: vi.fn(),
}));

describe('P-011 Submission Workspace Page and Elements (T-A11Y-P011, EL-069..EL-085)', () => {
  const mockWorkflow = {
    id: 'wf-sub-123',
    title: 'Summer Research Internship 2026',
    description: 'Mandatory internship guidelines',
    status: 'published',
    deadline: new Date(Date.now() + 86400000).toISOString(),
    fields: [
      { key: 'project_title', label: 'Project Title', type: 'text', required: true },
      { key: 'synopsis', label: 'Research Synopsis', type: 'text', required: false },
    ],
    stages: [{ stageIndex: 0, label: 'Faculty Mentor Review' }],
  };

  const mockSubmission = {
    id: 'sub-work-123',
    workflowId: 'wf-sub-123',
    studentId: '22222222-2222-2222-2222-222222222222',
    status: 'draft',
    answers: { project_title: 'AI Robotics' },
    attachments: [
      {
        id: 'att-123',
        displayName: 'Offer_Letter.pdf',
        mime: 'application/pdf',
        bytes: 1024,
        sha256: 'abcdef1234567890',
        createdAt: new Date().toISOString(),
      },
    ],
    history: [],
    stageIndex: 0,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    workflow: mockWorkflow,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiModule.api).mockImplementation((path: string) => {
      if (path === '/api/submissions/sub-work-123') return Promise.resolve(mockSubmission);
      if (path === '/api/workflows/wf-sub-123') return Promise.resolve(mockWorkflow);
      return Promise.resolve({});
    });
  });

  it('renders heading, field group, attachments, and elements EL-069..EL-085 in draft state', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/student/submissions/sub-work-123']}>
          <Routes>
            <Route path="/student/submissions/:submissionId" element={<SubmissionWorkspace />} />
          </Routes>
        </MemoryRouter>
      );
    });

    // Heading
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toContain('Summer Research Internship 2026');

    // EL-076 Return link
    const el076 = screen.getByTestId('EL-076');
    expect(el076).toBeDefined();
    expect(el076.getAttribute('href')).toBe('/student');

    // EL-081 Refresh status
    const el081 = screen.getByTestId('EL-081');
    expect(el081).toBeDefined();

    // EL-080 Requirements
    const el080 = screen.getByTestId('EL-080');
    expect(el080).toBeDefined();

    // EL-075 Timeline
    const el075 = screen.getByTestId('EL-075');
    expect(el075).toBeDefined();

    // EL-077 Delete draft
    const el077 = screen.getByTestId('EL-077');
    expect(el077).toBeDefined();

    // EL-070 Save draft answers
    const el070 = screen.getByTestId('EL-070');
    expect(el070).toBeDefined();

    // EL-069 Field group
    const el069 = screen.getByTestId('EL-069');
    expect(el069).toBeDefined();

    // EL-071 Upload file input
    const el071 = screen.getByTestId('EL-071');
    expect(el071).toBeDefined();

    // EL-072 Download attachment
    const el072 = screen.getByTestId('EL-072');
    expect(el072).toBeDefined();

    // EL-073 Rename attachment
    const el073 = screen.getByTestId('EL-073');
    expect(el073).toBeDefined();

    // EL-074 Delete attachment
    const el074 = screen.getByTestId('EL-074');
    expect(el074).toBeDefined();

    // EL-084 Submit first application (visible in draft)
    const el084 = screen.getByTestId('EL-084');
    expect(el084).toBeDefined();
  });

  it('handles attachment removal confirmation (EL-074, EL-082, EL-083)', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/student/submissions/sub-work-123']}>
          <Routes>
            <Route path="/student/submissions/:submissionId" element={<SubmissionWorkspace />} />
          </Routes>
        </MemoryRouter>
      );
    });

    const el074 = screen.getByTestId('EL-074');

    // Click Delete attachment -> opens modal
    await act(async () => {
      fireEvent.click(el074);
    });

    const el082 = screen.getByTestId('EL-082');
    const el083 = screen.getByTestId('EL-083');
    expect(el082).toBeDefined();
    expect(el083).toBeDefined();

    // Cancel removal with EL-083
    await act(async () => {
      fireEvent.click(el083);
    });
    expect(screen.queryByTestId('EL-082')).toBeNull();
  });

  it('handles submitting application (EL-084)', async () => {
    vi.mocked(apiModule.api).mockImplementation((path: string) => {
      if (path === '/api/submissions/sub-work-123') return Promise.resolve(mockSubmission);
      if (path === '/api/submissions/sub-work-123/submit') {
        return Promise.resolve({ ...mockSubmission, status: 'submitted' });
      }
      return Promise.resolve({});
    });

    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/student/submissions/sub-work-123']}>
          <Routes>
            <Route path="/student/submissions/:submissionId" element={<SubmissionWorkspace />} />
          </Routes>
        </MemoryRouter>
      );
    });

    const submitBtn = screen.getByTestId('EL-084');

    await act(async () => {
      fireEvent.click(submitBtn);
    });

    expect(apiModule.api).toHaveBeenCalledWith(
      '/api/submissions/sub-work-123/submit',
      expect.objectContaining({ method: 'POST' })
    );
  });
  async function mountSubmission() {
    await act(async () => { render(<MemoryRouter initialEntries={['/student/submissions/sub-work-123']}><Routes><Route path="/student/submissions/:submissionId" element={<SubmissionWorkspace />} /></Routes></MemoryRouter>); });
  }
  it('saves changed answers with the server version', async () => {
    await mountSubmission();
    await act(async () => { fireEvent.change(screen.getByLabelText('Project Title', { exact: false }), { target: { value: 'Revised research topic' } }); });
    await act(async () => { fireEvent.click(screen.getByTestId('EL-070')); });
    expect(apiModule.api).toHaveBeenCalledWith('/api/submissions/sub-work-123', { method: 'PATCH', body: JSON.stringify({ answers: { project_title: 'Revised research topic' }, expectedVersion: 1 }) });
  });
  it('uses the actual attachment response and updates its displayed name', async () => {
    await mountSubmission();
    vi.mocked(apiModule.api).mockResolvedValueOnce({ id: 'new-document', displayName: 'New offer.pdf', mime: 'application/pdf', bytes: 100, createdAt: new Date().toISOString() });
    const file = new File(['%PDF-1.4 sample'], 'New offer.pdf', { type: 'application/pdf' });
    await act(async () => { fireEvent.change(screen.getByTestId('EL-071'), { target: { files: [file] } }); });
    expect(screen.getByText('New offer.pdf')).toBeDefined();
    await act(async () => { fireEvent.click(screen.getAllByTestId('EL-073')[1]); });
    await act(async () => { fireEvent.change(screen.getByLabelText('Display Name'), { target: { value: 'Verified offer.pdf' } }); });
    await act(async () => { fireEvent.click(screen.getByText('Save Name')); });
    expect(screen.getByText('Verified offer.pdf')).toBeDefined();
    expect(apiModule.api).toHaveBeenCalledWith('/api/attachments/new-document', { method: 'PATCH', body: JSON.stringify({ displayName: 'Verified offer.pdf' }) });
    await act(async () => { fireEvent.click(screen.getAllByTestId('EL-074')[1]); });
    await act(async () => { fireEvent.click(screen.getByTestId('EL-082')); });
    expect(screen.queryByText('Verified offer.pdf')).toBeNull();
  });
  it('opens requirements and history without losing edited answers', async () => {
    await mountSubmission();
    await act(async () => { fireEvent.click(screen.getByTestId('EL-075')); });
    expect(screen.getByRole('dialog')).toBeDefined();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Close dialog' })); });
    await act(async () => { fireEvent.click(screen.getByTestId('EL-080')); });
    expect(screen.getByRole('dialog')).toBeDefined();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Close dialog' })); });
    expect((screen.getByLabelText('Project Title', { exact: false }) as HTMLInputElement).value).toBe('AI Robotics');
  });

});
