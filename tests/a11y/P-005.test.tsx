import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';
import InstructionIntake from '../../src/client/pages/InstructionIntake';
import * as apiModule from '../../src/client/api';

// Mock api
vi.mock('../../src/client/api', () => ({
  api: vi.fn(),
  setCsrfToken: vi.fn(),
}));

describe('P-005 Instruction Intake Page and Elements (T-A11Y-P005, EL-024..EL-029)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders heading, form controls, and elements EL-024..EL-029', async () => {
    await act(async () => {
      render(
        <BrowserRouter>
          <InstructionIntake />
        </BrowserRouter>
      );
    });

    // Heading
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toContain('Intake studio');

    // EL-029 Return to registry
    const el029 = screen.getByTestId('EL-029');
    expect(el029).toBeDefined();
    expect(el029.getAttribute('href')).toBe('/admin/workflows');

    // EL-027 Workflow title
    const el027 = screen.getByTestId('EL-027') as HTMLInputElement;
    expect(el027).toBeDefined();

    // EL-026 Upload text PDF
    const el026 = screen.getByTestId('EL-026') as HTMLInputElement;
    expect(el026).toBeDefined();
    expect(el026.type).toBe('file');

    // EL-024 Instruction text
    const el024 = screen.getByTestId('EL-024') as HTMLTextAreaElement;
    expect(el024).toBeDefined();

    // EL-028 Create editable workflow (disabled initially)
    const el028 = screen.getByTestId('EL-028') as HTMLButtonElement;
    expect(el028).toBeDefined();
    expect(el028.disabled).toBe(true);
  });

  it('enables EL-028 when title and instruction text are valid, and submits form', async () => {
    vi.mocked(apiModule.api).mockResolvedValue({ id: 'wf-created-123' });

    await act(async () => {
      render(
        <BrowserRouter>
          <InstructionIntake />
        </BrowserRouter>
      );
    });

    const titleInput = screen.getByTestId('EL-027');
    const textArea = screen.getByTestId('EL-024');
    const submitBtn = screen.getByTestId('EL-028') as HTMLButtonElement;

    // Type title and instruction text
    await act(async () => {
      fireEvent.change(titleInput, { target: { value: 'Annual Summer Research Fellowship' } });
      fireEvent.change(textArea, { target: { value: 'Mandatory internship for all CS students.' } });
    });

    expect(submitBtn.disabled).toBe(false);

    // Submit form
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    expect(apiModule.api).toHaveBeenCalledWith(
      '/api/workflows',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          title: 'Annual Summer Research Fellowship',
          description: 'Mandatory internship for all CS students.',
          rawText: 'Mandatory internship for all CS students.',
        }),
      })
    );
  });

  it('handles PDF file upload (EL-026) and remove source (EL-025)', async () => {
    vi.mocked(apiModule.api).mockResolvedValueOnce({
      id: 'src-123',
      sha256: 'abcdef1234567890',
    });

    await act(async () => {
      render(
        <BrowserRouter>
          <InstructionIntake />
        </BrowserRouter>
      );
    });

    const fileInput = screen.getByTestId('EL-026');
    const file = new File(['%PDF-1.4 mock content'], 'internship_circular.pdf', {
      type: 'application/pdf',
    });

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    expect(apiModule.api).toHaveBeenCalledWith('/api/documents', expect.anything());

    // EL-025 Remove uploaded source should appear
    const removeBtn = screen.getByTestId('EL-025');
    expect(removeBtn).toBeDefined();

    vi.mocked(apiModule.api).mockResolvedValueOnce({});

    await act(async () => {
      fireEvent.click(removeBtn);
    });

    expect(apiModule.api).toHaveBeenCalledWith('/api/documents/src-123', { method: 'DELETE' });
    expect(screen.queryByTestId('EL-025')).toBeNull();
  });
});
