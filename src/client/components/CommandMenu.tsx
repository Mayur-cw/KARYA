import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Dialog } from "./Dialog";
import { Icon, type IconName } from "./Icon";
import { useAuth } from "./AuthContext";
import { api } from "../api";
import type { WorkflowPage, SubmissionPage } from "../../shared/contracts";

export function CommandMenu({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { role } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    { id: string; title: string; detail: string; href: string }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setError("");
    }
  }, [open]);
  useEffect(() => {
    if (!open || !query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    const timer = window.setTimeout(() => {
      const request =
        role === "reviewer"
          ? api<SubmissionPage>(
              `/api/submissions?limit=6&q=${encodeURIComponent(query.trim())}`,
            ).then((data) =>
              data.items.map((item) => ({
                id: item.id,
                title: item.workflowTitle || "Assigned application",
                detail: `${item.studentName || "Applicant"} · ${item.status}`,
                href: `/reviewer/submissions/${item.id}`,
              })),
            )
          : api<WorkflowPage>(
              `/api/workflows?limit=6&q=${encodeURIComponent(query.trim())}`,
            ).then((data) =>
              data.items.map((item) => ({
                id: item.id,
                title: item.title,
                detail: `${item.stages.length} review stages · ${item.status}`,
                href: `/${role}/workflows/${item.id}${role === "admin" && ["draft", "proposed"].includes(item.status) ? "/edit" : ""}`,
              })),
            );
      request
        .then((items) => {
          if (active) setResults(items);
        })
        .catch(() => {
          if (active)
            setError(
              "Search is unavailable. You can still use the shortcuts below.",
            );
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [open, query, role]);
  const shortcuts: {
    label: string;
    href: string;
    icon: IconName;
    description: string;
  }[] = [
    {
      label:
        role === "admin"
          ? "Command Center"
          : role === "student"
            ? "My processes"
            : "Review inbox",
      href: `/${role}`,
      icon: "grid",
      description: "Your workspace overview",
    },
    ...(role === "admin"
      ? [
          {
            label: "Create a workflow",
            href: "/admin/studio",
            icon: "sparkle" as const,
            description: "Start from an official instruction",
          },
          {
            label: "Workflow registry",
            href: "/admin/workflows",
            icon: "layers" as const,
            description: "Find and manage your processes",
          },
        ]
      : []),
    {
      label: "Notifications",
      href: "/notifications",
      icon: "bell",
      description: "Updates and next steps",
    },
    {
      label: "My account",
      href: "/account",
      icon: "user",
      description: "Profile and session details",
    },
  ];
  const matching = shortcuts.filter((item) =>
    `${item.label} ${item.description}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <Dialog
      isOpen={open}
      onClose={onClose}
      title="Find your next step"
      description="Search your workflows or jump to a workspace."
      maxWidth="640px"
    >
      <div className="command-search input-with-icon">
        <Icon name="search" />
        <input
          data-autofocus
          className="form-input"
          type="search"
          aria-label="Search workflows and shortcuts"
          placeholder="Search workflows and shortcuts…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="command-status" role="status">
        {loading
          ? "Searching your accessible workflows…"
          : error ||
            (query && !results.length && !matching.length
              ? "No matches. Try a different title."
              : "")}
      </div>
      {results.length > 0 && (
        <div className="command-group">
          <p className="section-kicker">WORKFLOWS</p>
          {results.map((workflow) => (
            <Link
              key={workflow.id}
              to={workflow.href}
              onClick={onClose}
              className="command-result"
            >
              <Icon name="file" />
              <span>
                <strong>{workflow.title}</strong>
                <small>{workflow.detail}</small>
              </span>
              <Icon name="chevron" size={16} />
            </Link>
          ))}
        </div>
      )}
      <nav className="command-group" aria-label="Workspace shortcuts">
        <p className="section-kicker">QUICK NAVIGATION</p>
        {matching.map((item) => (
          <Link
            key={item.href}
            to={item.href}
            onClick={onClose}
            className="command-result"
          >
            <Icon name={item.icon} />
            <span>
              <strong>{item.label}</strong>
              <small>{item.description}</small>
            </span>
            <Icon name="chevron" size={16} />
          </Link>
        ))}
      </nav>
      <p className="command-footer">
        <kbd>Tab</kbd> to move · <kbd>Enter</kbd> to open · <kbd>Esc</kbd> to
        close
      </p>
    </Dialog>
  );
}
