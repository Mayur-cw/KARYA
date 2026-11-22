import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { StatusBadge } from "../components/StatusBadge";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { ErrorMessage } from "../components/ErrorMessage";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";
import { Deadline } from "../components/Deadline";
import type { WorkflowPage } from "../../shared/contracts";

const PAGE_SIZE = 5;
export default function WorkflowRegistry() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<WorkflowPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const search = params.get("q") || "";
  const status = params.get("status") || "all";
  const sort = params.get("sort") || "createdAt_desc";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [searchInput, setSearchInput] = useState(search);
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value && value !== "all") next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next, { replace: key === "q" });
  };
  useEffect(() => {
    setSearchInput(search);
  }, [search]);
  useEffect(() => {
    if (searchInput === search) return;
    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(params);
      if (searchInput) next.set("q", searchInput);
      else next.delete("q");
      next.delete("page");
      setParams(next, { replace: true });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput, search, params, setParams]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const query = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
      sort,
    });
    if (search) query.set("q", search);
    if (status !== "all") query.set("status", status);
    api<WorkflowPage>(`/api/workflows?${query}`)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to load workflows.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [search, status, sort, page, retry]);
  const total = data?.total || 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <div className="workflow-registry-page" data-testid="page-p-004">
      <Link to="/admin" data-testid="EL-023" className="back-link">
        <Icon name="grid" size={15} />
        Command Center
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">PROCESS LIBRARY</p>
          <h1>Workflow Registry</h1>
          <p className="card-subtitle">
            Every process, with a clear owner and a next step.
          </p>
        </div>
        <button
          type="button"
          data-testid="EL-022"
          className="btn btn-primary"
          onClick={() => navigate("/admin/studio")}
        >
          <Icon name="plus" size={18} />
          Create Workflow
        </button>
      </div>
      {error && (
        <ErrorMessage
          title="Workflows couldn’t be loaded"
          message={error}
          onRetry={() => setRetry((value) => value + 1)}
        />
      )}
      <section className="registry-toolbar card" aria-label="Filter workflows">
        <div className="registry-search">
          <label htmlFor="search-workflow-input" className="form-label">
            Search workflows
          </label>
          <div className="input-with-icon">
            <Icon name="search" size={18} />
            <input
              id="search-workflow-input"
              data-testid="EL-016"
              className="form-input"
              type="search"
              placeholder="Find a workflow by title…"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>
        </div>
        <div>
          <label htmlFor="filter-workflow-status" className="form-label">
            Status
          </label>
          <select
            id="filter-workflow-status"
            data-testid="EL-017"
            className="form-select"
            value={status}
            onChange={(event) => update("status", event.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="proposed">Proposed</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <div>
          <label htmlFor="sort-workflow-select" className="form-label">
            Sort by
          </label>
          <select
            id="sort-workflow-select"
            data-testid="EL-018"
            className="form-select"
            value={sort}
            onChange={(event) => update("sort", event.target.value)}
          >
            <option value="createdAt_desc">Newest first</option>
            <option value="createdAt_asc">Oldest first</option>
            <option value="title_asc">Title (A–Z)</option>
            <option value="deadline_asc">Upcoming deadline</option>
          </select>
        </div>
      </section>
      <div className="results-heading">
        <p role="status">
          {loading
            ? "Finding workflows…"
            : `${total} ${total === 1 ? "workflow" : "workflows"}${search ? ` matching “${search}”` : " in your department"}`}
        </p>
        {(search || status !== "all") && (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setSearchInput("");
              setParams(new URLSearchParams());
            }}
          >
            Clear filters
          </button>
        )}
      </div>
      {loading ? (
        <LoadingSkeleton label="Loading registered workflows…" lines={5} />
      ) : !data?.items.length ? (
        <EmptyState
          title="No matching workflows found"
          description={
            search || status !== "all"
              ? "Try another title or clear your filters to see all processes."
              : "Create your first workflow from an official instruction."
          }
          actionLabel={
            search || status !== "all" ? "Clear filters" : "Create Workflow"
          }
          onAction={() => {
            if (search || status !== "all") {
              setSearchInput("");
              setParams(new URLSearchParams());
            } else navigate("/admin/studio");
          }}
        />
      ) : (
        <section
          className="card registry-results"
          aria-label="Workflow results"
        >
          <div className="registry-list">
            {data.items.map((workflow) => (
              <article className="registry-item" key={workflow.id}>
                <span className="document-icon">
                  <Icon name="file" size={23} />
                </span>
                <div className="registry-item-main">
                  <div className="registry-item-title">
                    <Link
                      to={`/admin/workflows/${workflow.id}`}
                      className="workflow-title"
                    >
                      {workflow.title}
                    </Link>
                    <StatusBadge status={workflow.status} />
                  </div>
                  <div className="registry-item-detail">
                    <span>
                      <Icon name="layers" size={14} />
                      {workflow.stages.length} review stages
                    </span>
                    <span>
                      <Icon name="clock" size={14} />
                      <Deadline value={workflow.deadline} />
                    </span>
                    <span>Version {workflow.version}</span>
                  </div>
                </div>
                <Link
                  to={`/admin/workflows/${workflow.id}`}
                  data-testid="EL-021"
                  className="btn btn-secondary btn-sm"
                  aria-label={`Open ${workflow.title}`}
                >
                  Inspect
                  <Icon name="file" size={15} />
                </Link>
              </article>
            ))}
          </div>
          <div className="pagination-bar">
            <span>
              Showing {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, total)} of {total}
            </span>
            <div>
              <button
                type="button"
                data-testid="EL-020"
                className="btn btn-secondary btn-sm"
                disabled={page <= 1}
                onClick={() => update("page", String(page - 1))}
                aria-label="Previous workflow results"
              >
                Previous
              </button>
              <span className="page-indicator">
                {page} / {pages}
              </span>
              <button
                type="button"
                data-testid="EL-019"
                className="btn btn-secondary btn-sm"
                disabled={page >= pages}
                onClick={() => update("page", String(page + 1))}
                aria-label="Next workflow results"
              >
                Next
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
