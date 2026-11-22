import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';
import DemoSignIn from '../../src/client/pages/DemoSignIn';
import * as AuthContext from '../../src/client/components/AuthContext';

// Mock AuthContext
vi.mock('../../src/client/components/AuthContext', async () => {
  const actual = await vi.importActual('../../src/client/components/AuthContext');
  return {
    ...actual,
    useAuth: vi.fn(),
  };
});

describe('P-002 Demo Sign-in Page and Elements (T-A11Y-P002, EL-006..EL-008)', () => {
  const mockLogin = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      user: null,
      role: 'anonymous',
      loading: false,
      error: null,
      unreadCount: 0,
      login: mockLogin,
      logout: vi.fn(),
      refreshSession: vi.fn(),
      refreshUnreadCount: vi.fn(),
    });
  });

  it('renders heading, form controls, and back link', async () => {
    await act(async () => {
      render(
        <BrowserRouter>
          <DemoSignIn />
        </BrowserRouter>
      );
    });

    // Heading
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toContain('Welcome to KARYA');

    // EL-008 Back to welcome link
    const backLink = screen.getByTestId('EL-008');
    expect(backLink).toBeDefined();
    expect(backLink.getAttribute('href')).toBe('/');

    // EL-006 Choose demo identity
    const select = screen.getByTestId('EL-006') as HTMLSelectElement;
    expect(select).toBeDefined();
    expect(select.value).toBe('11111111-1111-1111-1111-111111111111');

    // EL-007 Start signed-in session
    const submitBtn = screen.getByTestId('EL-007');
    expect(submitBtn).toBeDefined();
  });

  it('handles selecting identity (EL-006) and submitting form (EL-007)', async () => {
    await act(async () => {
      render(
        <BrowserRouter>
          <DemoSignIn />
        </BrowserRouter>
      );
    });

    const select = screen.getByTestId('EL-006') as HTMLSelectElement;
    const submitBtn = screen.getByTestId('EL-007');

    // Select Student A
    await act(async () => {
      fireEvent.change(select, { target: { value: '22222222-2222-2222-2222-222222222222' } });
    });
    expect(select.value).toBe('22222222-2222-2222-2222-222222222222');

    // Submit form
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    expect(mockLogin).toHaveBeenCalledWith('22222222-2222-2222-2222-222222222222');
  });

  it('displays error message when login fails', async () => {
    mockLogin.mockRejectedValueOnce(new Error('Invalid demo actor'));

    await act(async () => {
      render(
        <BrowserRouter>
          <DemoSignIn />
        </BrowserRouter>
      );
    });

    const submitBtn = screen.getByTestId('EL-007');

    await act(async () => {
      fireEvent.click(submitBtn);
    });

    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText('Invalid demo actor')).toBeDefined();
  });
});
