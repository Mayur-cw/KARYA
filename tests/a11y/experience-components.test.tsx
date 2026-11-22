import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Link, Route, Routes } from "react-router-dom";
import { CommandMenu } from "../../src/client/components/CommandMenu";
import { Deadline } from "../../src/client/components/Deadline";
import { UnsavedChangesGuard } from "../../src/client/components/UnsavedChangesGuard";
import { ProcessCard } from "../../src/client/components/ProcessCard";
import { api } from "../../src/client/api";
const state = vi.hoisted(() => ({ role: "admin" }));
vi.mock("../../src/client/components/AuthContext", () => ({
  useAuth: () => ({ role: state.role }),
}));
vi.mock("../../src/client/api", () => ({ api: vi.fn() }));

beforeEach(() => {
  state.role = "admin";
  vi.clearAllMocks();
});
function menu(open = true) {
  return render(
    <MemoryRouter>
      <CommandMenu open={open} onClose={vi.fn()} />
    </MemoryRouter>,
  );
}
describe("Workspace search and next-step components", () => {
  it("does not create a dialog until search is opened", () => {
    menu(false);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api).not.toHaveBeenCalled();
  });
  it("focuses search, shows accessible shortcuts and links draft results to the editor", async () => {
    vi.mocked(api).mockResolvedValue({
      items: [
        {
          id: "workflow-one",
          title: "Research application",
          status: "draft",
          stages: [],
        },
      ],
    });
    menu();
    const input = screen.getByRole("searchbox");
    expect(document.activeElement).toBe(input);
    expect(
      screen
        .getByRole("link", { name: /Create a workflow/ })
        .getAttribute("href"),
    ).toBe("/admin/studio");
    fireEvent.change(input, { target: { value: "Research" } });
    const result = await screen.findByRole("link", {
      name: /Research application/,
    });
    expect(result.getAttribute("href")).toBe(
      "/admin/workflows/workflow-one/edit",
    );
    expect(api).toHaveBeenCalledWith("/api/workflows?limit=6&q=Research");
  });
  it("searches assigned submissions for reviewers and opens a valid review route", async () => {
    state.role = "reviewer";
    vi.mocked(api).mockResolvedValue({
      items: [
        {
          id: "submission-one",
          workflowTitle: "Travel grant",
          studentName: "Aarav",
          status: "submitted",
        },
      ],
    });
    menu();
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "Travel" },
    });
    expect(
      (await screen.findByRole("link", { name: /Travel grant/ })).getAttribute(
        "href",
      ),
    ).toBe("/reviewer/submissions/submission-one");
    expect(api).toHaveBeenCalledWith("/api/submissions?limit=6&q=Travel");
  });
  it("preserves navigation and gives a useful message when search fails", async () => {
    vi.mocked(api).mockRejectedValue(new Error("Offline"));
    menu();
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "workflow" },
    });
    await screen.findByText(/Search is unavailable/);
    expect(
      screen.getByRole("link", { name: /Create a workflow/ }),
    ).toBeDefined();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /Notifications/ })).toBeDefined(),
    );
  });
  it("shows an explicit empty result rather than invented matches", async () => {
    vi.mocked(api).mockResolvedValue({ items: [] });
    state.role = "student";
    menu();
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "zzzzzz" },
    });
    await screen.findByText("No matches. Try a different title.");
  });
  it("renders deadline states without invalid date text", () => {
    const { rerender } = render(<Deadline value="invalid" />);
    expect(screen.getByText("No deadline set")).toBeDefined();
    rerender(
      <Deadline
        value={new Date(Date.now() - 86400000).toISOString()}
        relative
      />,
    );
    expect(screen.getByText("Past deadline")).toBeDefined();
    rerender(
      <Deadline
        value={new Date(Date.now() + 10 * 86400000).toISOString()}
        relative
      />,
    );
    expect(screen.getByText("Due in 10 days")).toBeDefined();
    rerender(<Deadline value="2030-01-03T12:00:00Z" />);
    expect(screen.getByText(/2030/)).toBeDefined();
  });
  it.each([
    ["unstarted", undefined, "Start Application"],
    ["draft", "draft-id", "Continue draft"],
    ["needs_changes", "returned-id", "Fix & Resubmit"],
    ["approved", "approved-id", "View application"],
  ])("offers the right next step for %s", (status, id, label) => {
    render(
      <MemoryRouter>
        <ProcessCard
          workflowId="workflow-id"
          title="Research application"
          status={status!}
          submissionId={id}
          stages={2}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: label }).getAttribute("href")).toBe(
      id ? `/student/submissions/${id}` : "/student/workflows/workflow-id",
    );
  });
});

describe("Unsaved answer protection", () => {
  it("asks before in-app navigation, allows editing, and discards only on explicit action", async () => {
    render(
      <MemoryRouter>
        <Routes>
          <Route
            path="/"
            element={
              <>
                <UnsavedChangesGuard active />
                <Link to="/next-page">Leave editor</Link>
              </>
            }
          />
          <Route path="/next-page" element={<h1>Next page</h1>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("link", { name: "Leave editor" }));
    expect(
      screen.getByRole("dialog", { name: "Leave without saving?" }),
    ).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "Leave editor" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Discard changes and leave" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Next page" }),
    ).toBeDefined();
  });
  it("does not interrupt navigation when all changes are saved", () => {
    render(
      <MemoryRouter>
        <Routes>
          <Route
            path="/"
            element={
              <>
                <UnsavedChangesGuard active={false} />
                <Link to="/next-page">Continue</Link>
              </>
            }
          />
          <Route path="/next-page" element={<h1>Saved destination</h1>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("link", { name: "Continue" }));
    expect(
      screen.getByRole("heading", { name: "Saved destination" }),
    ).toBeDefined();
  });
});
