import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import WorkflowRegistry from '../../src/client/pages/WorkflowRegistry';
import * as apiModule from '../../src/client/api';

// Mock api
vi.mock('../../src/client/api', () => ({
  api: vi.fn(),
  setCsrfToken: vi.fn(),
}));

describe('P-004 Workflow Registry Page and Elements (T-A11Y-P004, EL-016..EL-023)', () => {
  const mockWorkflows = Array.from({ length: 8 }, (_, i) => ({
    id: `wf-mock-${i + 1}`,
    departmentId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
    title: `Workflow Title ${i + 1}`,
    description: `Description for workflow ${i + 1}`,
    status: i % 2 === 0 ? 'published' : 'draft',
    deadlinePolicy: {
      initialDeadline: new Date(Date.now() + (i + 1) * 86400000).toISOString(),
      allowLateResubmissions: true,
    },
    stages: [
      { stageIndex: 0, title: 'Review', assignedReviewerId: '44444444-4444-4444-4444-444444444444' },
    ],
    createdAt: new Date(Date.now() - (i + 1) * 100000).toISOString(),
    updatedAt: new Date().toISOString(),
  }));

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiModule.api).mockResolvedValue(mockWorkflows);
  });

  it('renders heading, table, filter bar, and controls EL-016..EL-023', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/admin/workflows']}>
          <WorkflowRegistry />
        </MemoryRouter>
      );
    });

    // Heading
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toContain('Workflow Registry');

    // EL-023 Back to command center
    const el023 = screen.getByTestId('EL-023');
    expect(el023).toBeDefined();
    expect(el023.getAttribute('href')).toBe('/admin');

    // EL-022 Create workflow
    const el022 = screen.getByTestId('EL-022');
    expect(el022).toBeDefined();

    // EL-016 Search title
    const el016 = screen.getByTestId('EL-016') as HTMLInputElement;
    expect(el016).toBeDefined();

    // EL-017 Status filter
    const el017 = screen.getByTestId('EL-017') as HTMLSelectElement;
    expect(el017).toBeDefined();

    // EL-018 Sort select
    const el018 = screen.getByTestId('EL-018') as HTMLSelectElement;
    expect(el018).toBeDefined();

    // EL-021 Open selected workflow
    const el021Elements = screen.getAllByTestId('EL-021');
    expect(el021Elements.length).toBe(5); // Page size is 5, total is 8

    // EL-020 Previous results (disabled on page 1)
    const el020 = screen.getByTestId('EL-020') as HTMLButtonElement;
    expect(el020.disabled).toBe(true);

    // EL-019 Next results (enabled on page 1 of 2)
    const el019 = screen.getByTestId('EL-019') as HTMLButtonElement;
    expect(el019.disabled).toBe(false);
  });

  it('filters workflows when typing in search input (EL-016)', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/admin/workflows']}>
          <WorkflowRegistry />
        </MemoryRouter>
      );
    });

    const searchInput = screen.getByTestId('EL-016');

    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'Title 2' } });
    });

    expect(screen.getByText('Workflow Title 2')).toBeDefined();
    expect(screen.queryByText('Workflow Title 1')).toBeNull();
  });

  it('filters workflows by status (EL-017)', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/admin/workflows']}>
          <WorkflowRegistry />
        </MemoryRouter>
      );
    });

    const statusSelect = screen.getByTestId('EL-017');

    await act(async () => {
      fireEvent.change(statusSelect, { target: { value: 'published' } });
    });

    // All visible status badges should be published
    const badges = screen.getAllByLabelText('Status: published');
    expect(badges.length).toBeGreaterThan(0);
    expect(screen.queryByLabelText('Status: draft')).toBeNull();
  });
});
