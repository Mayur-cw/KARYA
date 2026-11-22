import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../components/AuthContext";
import { Icon, type IconName } from "../components/Icon";
import { StatusBadge } from "../components/StatusBadge";
import { Deadline } from "../components/Deadline";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { ErrorMessage } from "../components/ErrorMessage";
import { EmptyState } from "../components/EmptyState";
import { api } from "../api";
import type { DashboardSummary } from "../../shared/dashboard";
import type { Workflow } from "../../shared/contracts";

function nextStep(workflow: Workflow): string {
  if (!workflow.deadline) return "Add an application deadline";
  if (
    !workflow.stages.length ||
    workflow.stages.some((stage) => !stage.reviewerId)
  )
    return "Assign your review team";
  return "Resolve unanswered requirements";
}

export default function AdminCommandCenter() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await api<DashboardSummary>("/api/dashboard"));
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load your dashboard.",
      );
      return false;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const refresh = async () => {
    setRefreshing(true);
    setMessage("");
    if (await load()) setMessage("Dashboard refreshed from live record totals");
  };
  const counts = data?.counts;
  const stats: {
    label: string;
    value?: number;
    detail: string;
    icon: IconName;
    className?: string;
  }[] = [
    {
      label: "Total workflows",
      value: counts?.total,
      detail: "Across your department",
      icon: "layers",
    },
    {
      label: "Published & active",
      value: counts?.published,
      detail: "Ready for student applications",
      icon: "check",
      className: "featured",
    },
    {
      label: "Awaiting review",
      value: counts?.awaitingReview,
      detail: "Submitted and in faculty review",
      icon: "inbox",
    },
    {
      label: "Needs attention",
      value: counts?.needsAttention,
      detail: "Drafts with open requirements",
      icon: "alert",
    },
  ];
  return (
    <div className="admin-command-center" data-testid="page-p-003">
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR DEPARTMENT AT A GLANCE</p>
          <h1>Command Center</h1>
          <p className="card-subtitle">
            Welcome back,{" "}
            {user?.name.replace(/\s*\([^)]*\)/g, "") || "Administrator"}. Let’s
            keep things moving.
          </p>
        </div>
        <div className="heading-actions">
          <button
            type="button"
            data-testid="EL-015"
            className="btn btn-secondary"
            onClick={refresh}
            disabled={refreshing || loading}
            aria-label="Refresh derived metrics"
          >
            <Icon name="refresh" size={17} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          <button
            type="button"
            data-testid="EL-010"
            className="btn btn-primary"
            onClick={() => navigate("/admin/studio")}
          >
            <Icon name="plus" size={18} />
            Create from instruction
          </button>
        </div>
      </div>
      {message && (
        <p className="inline-confirmation" role="status">
          <Icon name="check" size={16} />
          {message}
        </p>
      )}
      {error && (
        <ErrorMessage
          title="Dashboard couldn’t be updated"
          message={error}
          onRetry={refresh}
        />
      )}
      <section className="dashboard-welcome" aria-label="Your workspace">
        <div>
          <span className="welcome-overline">LESS ADMIN. MORE MOMENTUM.</span>
          <h2>
            A clear path from
            <br />
            instruction to outcome.
          </h2>
          <p>
            Bring your next circular to life. Keep every application,
            <br className="desktop-break" /> decision, and next step in one
            place.
          </p>
          <Link to="/admin/studio" className="btn btn-primary">
            <Icon name="sparkle" size={17} />
            Open intake studio
          </Link>
        </div>
        <img
          src="/illustrations/connected-campus.svg"
          width="800"
          height="620"
          alt="Connected campus with applications and review steps"
        />
      </section>
      <section className="stats-grid" aria-label="Operational metrics">
        {stats.map((stat) => (
          <article
            key={stat.label}
            className={`card stat-card ${stat.className || ""}`}
          >
            <div className="stat-top">
              <span>{stat.label}</span>
              <span className="stat-icon">
                <Icon name={stat.icon} size={18} />
              </span>
            </div>
            <div className="stat-value">
              {loading || error ? "—" : (stat.value ?? 0)}
            </div>
            <p className="stat-description">{stat.detail}</p>
          </article>
        ))}
      </section>
      <div className="dashboard-grid">
        <section className="card table-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">WORKSPACE ACTIVITY</span>
              <h2>Recent Workflows</h2>
              <p>Pick up where your department left off.</p>
            </div>
            <Link
              to="/admin/workflows"
              data-testid="EL-009"
              className="text-link"
            >
              View all workflows
            </Link>
          </div>
          {loading ? (
            <LoadingSkeleton label="Loading recent workflows…" lines={5} />
          ) : error ? (
            <div className="panel-padding">
              Refresh to load your latest records.
            </div>
          ) : !data?.recent.length ? (
            <EmptyState
              title="Your first workflow starts here"
              description="Turn an official instruction into a clear process."
              actionLabel="Create a workflow"
              onAction={() => navigate("/admin/studio")}
            />
          ) : (
            <div className="workflow-feed">
              {data.recent.map((workflow) => (
                <article className="workflow-feed-row" key={workflow.id}>
                  <span className="document-icon">
                    <Icon name="file" size={20} />
                  </span>
                  <div className="workflow-feed-main">
                    <Link
                      to={`/admin/workflows/${workflow.id}${["draft", "proposed"].includes(workflow.status) ? "/edit" : ""}`}
                      className="workflow-title"
                    >
                      {workflow.title}
                    </Link>
                    <p>
                      {workflow.stages.length} review{" "}
                      {workflow.stages.length === 1 ? "stage" : "stages"}
                      <span>·</span>Version {workflow.version}
                    </p>
                  </div>
                  <div className="workflow-feed-meta">
                    <StatusBadge status={workflow.status} />
                    <Deadline value={workflow.deadline} />
                  </div>
                  <Link
                    className="workflow-open"
                    to={`/admin/workflows/${workflow.id}${["draft", "proposed"].includes(workflow.status) ? "/edit" : ""}`}
                    aria-label={`Open ${workflow.title}`}
                  >
                    <Icon name="chevron" size={17} />
                  </Link>
                </article>
              ))}
            </div>
          )}
        </section>
        <div className="dashboard-side">
          <section className="card table-panel">
            <div className="panel-heading">
              <div>
                <span className="section-kicker">YOUR NEXT STEPS</span>
                <h2>Needs your attention</h2>
              </div>
              <span className="count-pill">
                {counts?.needsAttention ?? "—"}
              </span>
            </div>
            <div className="attention-body">
              {loading ? (
                <LoadingSkeleton lines={2} />
              ) : !data?.attention.length ? (
                <div className="attention-empty">
                  <Icon name="check" />
                  <div>
                    <strong>You’re all caught up</strong>
                    <p>No unresolved publication requirements.</p>
                  </div>
                </div>
              ) : (
                data.attention.map((workflow) => (
                  <Link
                    className="next-step-row"
                    key={workflow.id}
                    to={`/admin/workflows/${workflow.id}/edit`}
                  >
                    <span className="next-step-icon">
                      <Icon name="alert" size={18} />
                    </span>
                    <span>
                      <strong>{workflow.title}</strong>
                      <small>{nextStep(workflow)}</small>
                    </span>
                    <Icon name="chevron" size={16} />
                  </Link>
                ))
              )}
            </div>
          </section>
          <section className="card table-panel">
            <div className="panel-heading">
              <div>
                <span className="section-kicker">PROCESS HEALTH</span>
                <h2>Workflow overview</h2>
              </div>
              <Icon name="layers" />
            </div>
            <div className="composition-body">
              <div className="composition-total">
                <strong>{counts?.total ?? "—"}</strong>
                <span>total workflows</span>
              </div>
              {[
                {
                  label: "Published & active",
                  value: counts?.published || 0,
                  kind: "active",
                },
                {
                  label: "Drafts & proposals",
                  value: counts?.drafts || 0,
                  kind: "drafts",
                },
                {
                  label: "Archived",
                  value: counts?.archived || 0,
                  kind: "archived",
                },
              ].map((item) => (
                <div className="health-row" key={item.kind}>
                  <div>
                    <span className={`legend-dot ${item.kind}`} />
                    {item.label}
                    <strong>{item.value}</strong>
                  </div>
                  <progress
                    className={`health-progress ${item.kind}`}
                    value={item.value}
                    max={Math.max(counts?.total || 0, 1)}
                    aria-label={item.label}
                  />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
      <nav className="dashboard-utilities" aria-label="Dashboard utilities">
        <Link to="/admin/audit" data-testid="EL-011">
          <Icon name="log" size={16} />
          Inspect audit events
        </Link>
        <Link to="/notifications" data-testid="EL-012">
          <Icon name="bell" size={16} />
          Notifications
        </Link>
        <Link to="/account" data-testid="EL-013">
          <Icon name="user" size={16} />
          My account
        </Link>
        <button
          type="button"
          className="text-button"
          data-testid="EL-014"
          onClick={async () => {
            try {
              await logout();
              navigate("/login");
            } catch (cause) {
              setError(
                cause instanceof Error ? cause.message : "Unable to sign out.",
              );
            }
          }}
        >
          Sign out
        </button>
      </nav>
    </div>
  );
}
