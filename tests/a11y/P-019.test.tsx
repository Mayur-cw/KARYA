import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import React from 'react';
import SubmissionInspector from '../../src/client/pages/SubmissionInspector';
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

describe('P-019 Administrative Submission Inspector (T-A11Y-P019, EL-138..EL-142)', () => {
  const mockSubmission = {
    id: 'sub-insp-101',
    workflowId: 'wf-internship-1',
    studentId: '22222222-2222-2222-2222-222222222222',
    studentName: 'Aarav Patel',
    studentEmail: 'aarav@karya.local',
    workflowTitle: 'Summer Internship 2026',
    status: 'in_review',
    stageIndex: 1,
    revision: 2,
    version: 4,
    answers: {
      companyName: 'TechCorp Labs',
      stipendAmount: '25000',
    },
    currentReviewerId: '55555555-5555-5555-5555-555555555555',
    currentReviewerName: 'Dean Academic Affairs',
    attachments: [
      {
        id: 'att-insp-1',
        submissionId: 'sub-insp-101',
        displayName: 'offer_letter.pdf',
        mime: 'application/pdf',
        bytes: 102400,
        status: 'draft',
        createdAt: new Date().toISOString(),
      },
    ],
    history: [
      {
        stageIndex: 0,
        reviewerId: '44444444-4444-4444-4444-444444444444',
        reviewerName: 'Prof. Ramesh Kumar',
        action: 'approve',
        reason: 'Recommended for dean approval',
        decidedAt: new Date(Date.now() - 3600000).toISOString(),
      },
    ],
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockWorkflow = {
    id: 'wf-internship-1',
    title: 'Summer Internship 2026',
    description: 'Summer internship requirements',
    deadline: new Date(Date.now() + 86400000).toISOString(),
    schema: {
      fields: [
        { id: 'companyName', label: 'Company Name', type: 'text', required: true },
        { id: 'stipendAmount', label: 'Stipend Amount (INR)', type: 'number', required: false },
      ],
    },
    stages: [
      { name: 'Faculty Mentor Endorsement', reviewerId: '44444444-4444-4444-4444-444444444444', reviewerName: 'Prof. Ramesh Kumar' },
      { name: 'Dean Final Approval', reviewerId: '55555555-5555-5555-5555-555555555555', reviewerName: 'Dean Academic Affairs' },
    ],
  };

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
      if (path === '/api/submissions/sub-insp-101') {
        return Promise.resolve(mockSubmission);
      }
      if (path === '/api/workflows/wf-internship-1') {
        return Promise.resolve(mockWorkflow);
      }
      return Promise.resolve({});
    });
  });

  it('renders heading, student answers, and controls EL-138..EL-142', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/admin/submissions/sub-insp-101']}>
          <Routes>
            <Route path="/admin/submissions/:submissionId" element={<SubmissionInspector />} />
          </Routes>
        </MemoryRouter>
      );
    });

    // Heading
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toContain('Administrative Submission Inspector');

    // EL-141 Back to participation monitor
    const el141 = screen.getByTestId('EL-141');
    expect(el141.getAttribute('href')).toBe('/admin/workflows/wf-internship-1/monitor');

    // EL-142 Copy case reference
    const el142 = screen.getByTestId('EL-142');
    expect(el142).toBeDefined();

    // EL-140 View published workflow
    const el140 = screen.getByTestId('EL-140');
    expect(el140).toBeDefined();

    // EL-139 Refresh stage history
    const el139 = screen.getByTestId('EL-139');
    expect(el139).toBeDefined();

    // EL-138 Open attached evidence
    const el138 = screen.getByTestId('EL-138');
    expect(el138).toBeDefined();

    // Verify stage history rendered
    expect(screen.getByText(/Recommended for dean approval/)).toBeDefined();
  });

  it('handles refresh (EL-139) and copy case reference (EL-142)', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/admin/submissions/sub-insp-101']}>
          <Routes>
            <Route path="/admin/submissions/:submissionId" element={<SubmissionInspector />} />
          </Routes>
        </MemoryRouter>
      );
    });

    const el139 = screen.getByTestId('EL-139');
    const el142 = screen.getByTestId('EL-142');

    await act(async () => {
      fireEvent.click(el139);
    });
    expect(apiModule.api).toHaveBeenCalledWith('/api/submissions/sub-insp-101');

    await act(async () => {
      fireEvent.click(el142);
    });
    expect(screen.getByText(/Copied case reference/)).toBeDefined();
  });
});
