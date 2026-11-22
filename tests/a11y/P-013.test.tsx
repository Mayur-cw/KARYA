import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import React from 'react';
import ReviewWorkbench from '../../src/client/pages/ReviewWorkbench';
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

describe('P-013 Review Workbench Page and Elements (T-A11Y-P013, EL-095..EL-106)', () => {
  const mockSubmission = {
    id: 'sub-rev-101',
    workflowId: 'wf-internship-1',
    studentId: '22222222-2222-2222-2222-222222222222',
    studentName: 'Aarav Patel',
    studentEmail: 'aarav@karya.local',
    workflowTitle: 'Summer Internship 2026',
    status: 'submitted',
    stageIndex: 0,
    revision: 1,
    version: 3,
    answers: {
      companyName: 'TechCorp Labs',
      stipendAmount: '25000',
    },
    currentReviewerId: '44444444-4444-4444-4444-444444444444',
    currentReviewerName: 'Prof. Ramesh Kumar',
    attachments: [
      {
        id: 'att-rev-1',
        submissionId: 'sub-rev-101',
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
        action: 'needs_changes',
        reason: 'Please upload the signed version of offer letter',
        decidedAt: new Date(Date.now() - 3600000).toISOString(),
      },
    ],
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockWorkflow = {
    id: 'wf-internship-1',
    title: 'Summer Internship 2026',
    description: 'Mandatory summer internship approval workflow',
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
        id: '44444444-4444-4444-4444-444444444444',
        email: 'mentor@karya.local',
        name: 'Prof. Ramesh Kumar',
        role: 'reviewer',
        departmentId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      },
      role: 'reviewer',
      loading: false,
      error: null,
      unreadCount: 0,
      login: vi.fn(),
      logout: vi.fn(),
      refreshSession: vi.fn(),
      refreshUnreadCount: vi.fn(),
    });

    vi.mocked(apiModule.api).mockImplementation((path: string) => {
      if (path === '/api/submissions/sub-rev-101') {
        return Promise.resolve(mockSubmission);
      }
      if (path === '/api/workflows/wf-internship-1') {
        return Promise.resolve(mockWorkflow);
      }
      return Promise.resolve({});
    });
  });

  it('renders heading, student answers, and elements EL-095..EL-103', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/reviewer/submissions/sub-rev-101']}>
          <Routes>
            <Route path="/reviewer/submissions/:submissionId" element={<ReviewWorkbench />} />
          </Routes>
        </MemoryRouter>
      );
    });

    // Heading
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toContain('Review Workbench');

    // EL-101 Return to review inbox
    const el101 = screen.getByTestId('EL-101');
    expect(el101).toBeDefined();
    expect(el101.getAttribute('href')).toBe('/reviewer');

    // EL-095 Read attached evidence
    const el095 = screen.getByTestId('EL-095');
    expect(el095).toBeDefined();

    // EL-096 Refresh submission state
    const el096 = screen.getByTestId('EL-096');
    expect(el096).toBeDefined();

    // EL-097 View workflow requirements
    const el097 = screen.getByTestId('EL-097');
    expect(el097).toBeDefined();

    // EL-103 Copy submission reference
    const el103 = screen.getByTestId('EL-103');
    expect(el103).toBeDefined();

    // EL-098 Write decision feedback
    const el098 = screen.getByTestId('EL-098');
    expect(el098).toBeDefined();

    // EL-099 Open decision confirmation
    const el099 = screen.getByTestId('EL-099');
    expect(el099).toBeDefined();

    // EL-102 Inspect earlier decisions
    const el102 = screen.getByTestId('EL-102');
    expect(el102).toBeDefined();
  });

  it('expands decision timeline (EL-102) and copies reference (EL-103)', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/reviewer/submissions/sub-rev-101']}>
          <Routes>
            <Route path="/reviewer/submissions/:submissionId" element={<ReviewWorkbench />} />
          </Routes>
        </MemoryRouter>
      );
    });

    const el102 = screen.getByTestId('EL-102');
    await act(async () => {
      fireEvent.click(el102);
    });

    expect(screen.getByText(/Please upload the signed version/)).toBeDefined();

    const el103 = screen.getByTestId('EL-103');
    await act(async () => {
      fireEvent.click(el103);
    });
    expect(screen.getByText(/Copied submission reference/)).toBeDefined();
  });

  it('handles stage approval decision (EL-099, EL-104, EL-100)', async () => {
    vi.mocked(apiModule.api).mockImplementation((path: string, options?: RequestInit) => {
      if (path === '/api/submissions/sub-rev-101' && (!options || options.method === 'GET')) {
        return Promise.resolve(mockSubmission);
      }
      if (path === '/api/workflows/wf-internship-1') {
        return Promise.resolve(mockWorkflow);
      }
      if (path === '/api/submissions/sub-rev-101/decision') {
        return Promise.resolve({ success: true });
      }
      return Promise.resolve({});
    });

    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/reviewer/submissions/sub-rev-101']}>
          <Routes>
            <Route path="/reviewer/submissions/:submissionId" element={<ReviewWorkbench />} />
          </Routes>
        </MemoryRouter>
      );
    });

    // Click EL-099 to open confirm
    const el099 = screen.getByTestId('EL-099');
    await act(async () => {
      fireEvent.click(el099);
    });

    // Verify modal is open and EL-100 (Cancel) & EL-104 (Approve) exist
    const el100 = screen.getByTestId('EL-100');
    const el104 = screen.getByTestId('EL-104');
    expect(el100).toBeDefined();
    expect(el104).toBeDefined();

    // Click EL-104 to submit approval
    await act(async () => {
      fireEvent.click(el104);
    });

    expect(apiModule.api).toHaveBeenCalledWith(
      '/api/submissions/sub-rev-101/decision',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"action":"approve"'),
      })
    );
  });
});
