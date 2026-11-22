import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { ErrorMessage } from '../components/ErrorMessage';
import { api, ApiError } from '../api';
import { fetchCollection } from '../collections';

interface DynamicField {
  id: string;
  key: string;
  label: string;
  type: string;
  required: boolean;
}

interface WorkflowData {
  id: string;
  departmentId: string;
  title: string;
  description: string;
  status: 'published' | 'archived';
  deadline?: string;
  deadlinePolicy?: {
    initialDeadline: string;
    allowLateResubmissions: boolean;
  };
  fields: DynamicField[];
  stages: Array<{ stageIndex: number; label: string }>;
}

export default function ProcessRequirements() {
  const { workflowId } = useParams<{ workflowId: string }>();
  const navigate = useNavigate();

  const [workflow, setWorkflow] = useState<WorkflowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [showFields, setShowFields] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadWorkflow = useCallback(async () => {
    if (!workflowId) return;
    try {
      setLoading(true);
      setErrorMsg(null);
      const data = await api<WorkflowData>(`/api/workflows/${workflowId}`);
      setWorkflow(data);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load process requirements');
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    loadWorkflow();
  }, [loadWorkflow]);

  // EL-067 Start my application
  const handleStartApplication = async () => {
    if (!workflowId) return;
    setStarting(true);
    setErrorMsg(null);

    try {
      // EP-023: Create or fetch student's draft submission
      const result = await api<{ id: string }>(`/api/workflows/${workflowId}/submissions`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      navigate(`/student/submissions/${result.id}`);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        // Already started — fetch user's submissions to find the existing one
        try {
          const mySubs = await fetchCollection<{ id: string; workflowId: string }>('/api/submissions');
          const existing = mySubs.find((s) => s.workflowId === workflowId);
          if (existing) {
            navigate(`/student/submissions/${existing.id}`);
            return;
          }
        } catch {
          // fallback
        }
      }
      setErrorMsg(err instanceof Error ? err.message : 'Failed to start application draft');
    } finally {
      setStarting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '32px 0' }}>
        <LoadingSkeleton label="Loading application requirements and submission guidelines..." lines={6} />
      </div>
    );
  }

  if (!workflow) {
    return (
      <ErrorMessage
        title="Requirements Unavailable"
        message="This workflow could not be found or you are not an authorized assigned applicant."
        code="NOT_FOUND"
        onRetry={loadWorkflow}
      />
    );
  }

  const deadlineStr = workflow.deadline || workflow.deadlinePolicy?.initialDeadline;
  const isPastDeadline = deadlineStr ? new Date(deadlineStr).getTime() < Date.now() : false;

  return (
    <div className="process-requirements-page" data-testid="page-p-010" style={{ maxWidth: '840px', margin: '0 auto' }}>
      {/* EL-068 Back link */}
      <div style={{ marginBottom: '16px' }}>
        <Link to="/student" data-testid="EL-068" className="btn btn-secondary btn-sm">
          Back to My Processes
        </Link>
      </div>

      {errorMsg && (
        <ErrorMessage
          title="Submission Notice"
          message={errorMsg}
          code="START_FAILED"
          onRetry={() => setErrorMsg(null)}
          className="mb-4"
        />
      )}

      {/* Main Overview Card */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header" style={{ marginBottom: '16px' }}>
          <div>
            <span className="badge badge-published" style={{ marginBottom: '8px' }}>
              Authorized Departmental Process
            </span>
            <h1>{workflow.title}</h1>
            <p className="card-subtitle">
              Official application portal for assigned student cohort.
            </p>
          </div>
        </div>

        <p style={{ fontSize: '15px', color: 'var(--ink-secondary)', lineHeight: 1.6, marginBottom: '20px' }}>
          {workflow.description || 'Review the requirements below, ensure you have all supporting documentation prepared, and start your submission draft.'}
        </p>

        {/* Deadline & Policy Banner */}
        <div
          style={{
            padding: '16px 20px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: isPastDeadline ? 'var(--danger-bg)' : 'var(--bg-subtle)',
            border: `1px solid ${isPastDeadline ? 'var(--danger-border)' : 'var(--border-medium)'}`,
            marginBottom: '24px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: isPastDeadline ? 'var(--danger)' : 'var(--ink-muted)' }}>
                INITIAL SUBMISSION DEADLINE
              </div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: isPastDeadline ? 'var(--danger)' : 'var(--ink-primary)' }}>
                {deadlineStr ? new Date(deadlineStr).toLocaleString() : 'Unspecified'}
              </div>
            </div>
            <div>
              <span className={`badge ${isPastDeadline ? 'badge-rejected' : 'badge-published'}`}>
                {isPastDeadline ? 'Deadline Passed' : 'Submissions Open'}
              </span>
            </div>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--ink-muted)', marginTop: '8px' }}>
            Initial applications must meet the deadline. You may resubmit after the deadline when a reviewer requests changes.
          </div>
        </div>

        {/* Dynamic Required Fields Preview (EL-066) */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h2 style={{ fontSize: '16px', margin: 0 }}>Required Information & Documents</h2>
            <button
              type="button"
              data-testid="EL-066"
              className="btn btn-secondary btn-sm"
              onClick={() => setShowFields(!showFields)}
            >
              {showFields ? 'Hide Required Fields' : 'View Dynamic Required Fields'}
            </button>
          </div>

          {showFields && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                padding: '16px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--bg-subtle)',
                border: '1px solid var(--border-light)',
              }}
            >
              {workflow.fields?.map((f) => (
                <div
                  key={f.key}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--bg-card)',
                    fontSize: '13px',
                  }}
                >
                  <span>
                    <strong>{f.label}</strong> {f.required && <span style={{ color: 'var(--danger)' }}>*</span>}
                  </span>
                  <span className="badge badge-draft" style={{ fontSize: '11px' }}>
                    {f.type}
                  </span>
                </div>
              ))}
              <div style={{ fontSize: '12px', color: 'var(--ink-muted)', marginTop: '6px' }}>
                Note: File attachments must be valid PDF, PNG, or JPEG under 5 MiB with verified signatures.
              </div>
            </div>
          )}
        </div>

        {/* Review Flow Overview */}
        <div style={{ marginBottom: '28px' }}>
          <h2 style={{ fontSize: '16px', marginBottom: '10px' }}>Multi-Stage Governance Pipeline</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
            {workflow.stages?.map((s) => (
              <div
                key={s.stageIndex}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-light)',
                }}
              >
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--primary-subtle)',
                    color: 'var(--primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '12px',
                  }}
                >
                  {s.stageIndex + 1}
                </div>
                <div>
                  <strong>{s.label}</strong>
                  <div style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>
                    Sequential human review and evaluation
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Start Application CTA (EL-067) */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', paddingTop: '16px', borderTop: '1px solid var(--border-light)' }}>
          <Link to="/student" className="btn btn-secondary">
            Cancel
          </Link>
          <button
            type="button"
            data-testid="EL-067"
            className="btn btn-primary"
            onClick={handleStartApplication}
            disabled={starting || isPastDeadline}
          >
            {starting ? 'Initiating Draft...' : 'Start My Application'}
          </button>
        </div>
      </div>
    </div>
  );
}
