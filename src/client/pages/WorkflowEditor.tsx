import React, { useState, useEffect, useCallback } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { StatusBadge } from "../components/StatusBadge";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { ErrorMessage } from "../components/ErrorMessage";
import { Dialog } from "../components/Dialog";
import { api } from "../api";
import { fetchCollection } from "../collections";

interface DynamicField {
  id?: string;
  key: string;
  label: string;
  type: "text" | "select" | "date" | "file";
  required: boolean;
  options?: string[];
  placeholder?: string;
}

interface ReviewStage {
  stageIndex: number;
  label: string;
  reviewerId: string;
}

interface UncertaintyItem {
  id: string;
  kind: string;
  description: string;
  sourceSpan?: [number, number];
  resolved: boolean;
  resolutionNote?: string;
}

interface SourceDocumentScoped {
  id: string;
  title: string;
  extractedLength: number;
  extractedText: string;
}

interface WorkflowData {
  id: string;
  departmentId: string;
  title: string;
  description: string;
  status: "draft" | "proposed" | "published" | "archived";
  version: number;
  origin: string;
  deadline?: string;
  fields: DynamicField[];
  stages: ReviewStage[];
  uncertainties: UncertaintyItem[];
  sourceDocument?: SourceDocumentScoped | null;
}

interface UserOption {
  id: string;
  name: string;
  email: string;
  role: string;
}

function toLocalInput(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

export default function WorkflowEditor() {
  const { workflowId } = useParams<{ workflowId: string }>();
  const navigate = useNavigate();

  const [workflow, setWorkflow] = useState<WorkflowData | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form local state
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState("");
  const [fields, setFields] = useState<DynamicField[]>([]);
  const [stages, setStages] = useState<ReviewStage[]>([]);
  const [uncertainties, setUncertainties] = useState<UncertaintyItem[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

  // Dialogs
  const [showPreview, setShowPreview] = useState(false);
  const [editingFieldIndex, setEditingFieldIndex] = useState<number | null>(
    null,
  );
  const [fieldModalOpen, setFieldModalOpen] = useState(false);
  const [tempField, setTempField] = useState<DynamicField>({
    id: "",
    key: "",
    label: "",
    type: "text",
    required: true,
  });

  const [resolvingUncertaintyId, setResolvingUncertaintyId] = useState<
    string | null
  >(null);
  const [resolutionNote, setResolutionNote] = useState("");

  const loadData = useCallback(async () => {
    if (!workflowId) return;
    try {
      setLoading(true);
      setErrorMsg(null);

      const [wfData, usersData] = await Promise.all([
        api<WorkflowData>(`/api/workflows/${workflowId}`),
        fetchCollection<UserOption>("/api/users"),
      ]);

      setWorkflow(wfData);
      setUsers(usersData || []);

      setTitle(wfData.title || "");
      setDeadline(wfData.deadline ? toLocalInput(wfData.deadline) : "");
      setFields(wfData.fields || []);

      // Ensure at least 2 stages exist
      if (wfData.stages && wfData.stages.length >= 2) {
        setStages(wfData.stages);
      } else {
        setStages([
          {
            stageIndex: 0,
            label: "Faculty Mentor Review",
            reviewerId: wfData.stages?.[0]?.reviewerId || "",
          },
          {
            stageIndex: 1,
            label: "Dean / Final Sanction",
            reviewerId: wfData.stages?.[1]?.reviewerId || "",
          },
        ]);
      }

      setUncertainties(wfData.uncertainties || []);

      // Default student assignment if none selected
      const students = (usersData || []).filter((u) => u.role === "student");
      if (students.length > 0) {
        setSelectedStudentIds([students[0].id]);
      }
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to load workflow draft",
      );
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // EL-030 Generate evidence-linked proposal
  const handleProposeAI = async () => {
    if (!workflowId) return;
    setProposing(true);
    setErrorMsg(null);
    try {
      const updated = await api<WorkflowData>(
        `/api/workflows/${workflowId}/propose`,
        {
          method: "POST",
          body: JSON.stringify({ expectedVersion: workflow?.version }),
        },
      );
      setWorkflow(updated);
      setFields(updated.fields || []);
      if (updated.deadline) setDeadline(toLocalInput(updated.deadline));
      if (updated.stages && updated.stages.length > 0)
        setStages(updated.stages);
      setUncertainties(updated.uncertainties || []);
      showToast("Proposal synthesized from source document");
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : "AI proposal synthesis failed",
      );
    } finally {
      setProposing(false);
    }
  };

  // EL-031 Choose manual proposal
  const handleChooseManual = () => {
    if (fields.length === 0) {
      setFields([
        {
          key: "project_title",
          label: "Internship Project Title",
          type: "text",
          required: true,
          placeholder: "Enter official project or research title",
        },
        {
          key: "offer_letter",
          label: "Upload Signed Offer Letter (PDF)",
          type: "file",
          required: true,
        },
      ]);
    }
    showToast("Switched to manual workflow configuration mode");
  };

  // Field Editor handlers (EL-034, EL-035, EL-037)
  const handleOpenAddField = () => {
    setEditingFieldIndex(null);
    setTempField({
      key: "",
      label: "",
      type: "text",
      required: true,
      placeholder: "",
    });
    setFieldModalOpen(true);
  };

  const handleOpenEditField = (index: number) => {
    setEditingFieldIndex(index);
    setTempField({ ...fields[index] });
    setFieldModalOpen(true);
  };

  const handleSaveField = () => {
    if (!tempField.label.trim()) return;
    const key =
      tempField.key.trim() ||
      tempField.label
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_")
        .slice(0, 50);
    if (
      !/^[a-zA-Z0-9_]{1,50}$/.test(key) ||
      fields.some(
        (field, index) => index !== editingFieldIndex && field.key === key,
      )
    ) {
      setErrorMsg(
        "Use a unique field key with letters, numbers, and underscores (up to 50 characters).",
      );
      return;
    }
    const choices = (tempField.options || [])
      .map((value) => value.trim())
      .filter(Boolean);
    if (
      tempField.type === "select" &&
      (!choices.length ||
        choices.length > 20 ||
        new Set(choices).size !== choices.length ||
        choices.some((value) => value.length > 100))
    ) {
      setErrorMsg(
        "Add between 1 and 20 unique options, each up to 100 characters.",
      );
      return;
    }
    const finalField: DynamicField = {
      ...tempField,
      key,
      options: tempField.type === "select" ? choices : undefined,
    };

    if (editingFieldIndex !== null) {
      const updated = [...fields];
      updated[editingFieldIndex] = finalField;
      setFields(updated);
    } else {
      setFields([...fields, finalField]);
    }
    setFieldModalOpen(false);
    showToast("Field configuration saved");
  };

  const handleRemoveField = (index: number) => {
    setFields(fields.filter((_, i) => i !== index));
    showToast("Field removed from schema");
  };

  // Uncertainty Resolution (EL-041)
  const handleOpenResolve = (uId: string) => {
    setResolvingUncertaintyId(uId);
    setResolutionNote("");
  };

  const handleConfirmResolve = () => {
    if (!resolvingUncertaintyId) return;
    setUncertainties(
      uncertainties.map((u) =>
        u.id === resolvingUncertaintyId
          ? {
              ...u,
              resolved: true,
              resolutionNote:
                resolutionNote.trim() || "Manually verified by administrator",
            }
          : u,
      ),
    );
    setResolvingUncertaintyId(null);
    showToast("Uncertainty resolved and noted");
  };

  // EL-042 Save workflow draft
  const handleSaveDraft = async () => {
    if (!workflowId || !workflow) return;
    setSaving(true);
    setErrorMsg(null);

    try {
      const payload = {
        expectedVersion: workflow.version,
        title: title.trim(),
        deadline: deadline ? new Date(deadline).toISOString() : undefined,
        fields,
        stages,
        uncertainties,
      };

      const updated = await api<WorkflowData>(`/api/workflows/${workflowId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      setWorkflow(updated);
      showToast("Workflow draft version saved successfully");
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Save draft failed");
    } finally {
      setSaving(false);
    }
  };

  // EL-036 Publish approved workflow
  const handlePublish = async () => {
    if (!workflowId || !workflow) return;
    setPublishing(true);
    setErrorMsg(null);

    try {
      // First ensure draft changes are saved
      await api(`/api/workflows/${workflowId}`, {
        method: "PATCH",
        body: JSON.stringify({
          expectedVersion: workflow.version,
          title: title.trim(),
          deadline: deadline ? new Date(deadline).toISOString() : undefined,
          fields,
          stages,
          uncertainties,
        }),
      });

      // Get latest version number
      const current = await api<WorkflowData>(`/api/workflows/${workflowId}`);

      // Publish with selected student cohort
      await api(`/api/workflows/${workflowId}/publish`, {
        method: "POST",
        body: JSON.stringify({
          expectedVersion: current.version,
          studentIds: selectedStudentIds,
        }),
      });

      showToast("Workflow successfully published to student cohort");
      navigate(`/admin/workflows/${workflowId}`);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Publication gate rejected this workflow",
      );
    } finally {
      setPublishing(false);
    }
  };

  // Gate Check calculations
  const unresolvedUncertainties = uncertainties.filter((u) => !u.resolved);
  const reviewerStage0Assigned = Boolean(stages[0]?.reviewerId);
  const reviewerStage1Assigned = Boolean(stages[1]?.reviewerId);
  const deadlineValid = Boolean(
    deadline && new Date(deadline).getTime() > Date.now(),
  );
  const fieldsValid = fields.length > 0;
  const studentsValid = selectedStudentIds.length > 0;
  const titleValid = title.trim().length >= 5;

  const canPublish =
    titleValid &&
    deadlineValid &&
    fieldsValid &&
    reviewerStage0Assigned &&
    reviewerStage1Assigned &&
    unresolvedUncertainties.length === 0 &&
    studentsValid;

  const reviewers = Array.isArray(users)
    ? users.filter((u) => u.role === "reviewer")
    : [];
  const studentUsers = Array.isArray(users)
    ? users.filter((u) => u.role === "student")
    : [];

  if (loading) {
    return (
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "32px 0" }}>
        <LoadingSkeleton
          label="Loading workflow editor and schema draft..."
          lines={8}
        />
      </div>
    );
  }

  if (!workflow) {
    return (
      <ErrorMessage
        title="Workflow Not Found"
        message="The requested workflow draft could not be loaded."
        code="WORKFLOW_NOT_FOUND"
        onRetry={loadData}
      />
    );
  }

  return (
    <div
      className="explainable-workflow-editor"
      data-testid="page-p-006"
      style={{ maxWidth: "1100px", margin: "0 auto" }}
    >
      {/* EL-044 Back link */}
      <div style={{ marginBottom: "16px" }}>
        <Link
          to={`/admin/workflows/${workflowId}`}
          data-testid="EL-044"
          className="btn btn-secondary btn-sm"
        >
          Back to Workflow Overview
        </Link>
      </div>

      {/* Header and status */}
      <div
        className="card-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "8px",
            }}
          >
            <span className="badge badge-published">Explainable Editor</span>
            <StatusBadge status={workflow.status} />
            <span style={{ fontSize: "13px", color: "var(--ink-muted)" }}>
              v{workflow.version}
            </span>
          </div>
          <h1>Workflow editor</h1>
          <p className="card-subtitle">
            Define the application, choose reviewers, and confirm requirements
            before publishing.
          </p>
        </div>

        {/* Global Save and Preview CTAs */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            data-testid="EL-043"
            className="btn btn-secondary btn-sm"
            onClick={() => setShowPreview(true)}
          >
            Preview Student Form
          </button>
          <button
            type="button"
            data-testid="EL-042"
            className="btn btn-secondary btn-sm"
            onClick={handleSaveDraft}
            disabled={saving || publishing}
          >
            {saving ? "Saving..." : "Save Draft"}
          </button>
        </div>
      </div>

      {toastMessage && (
        <div
          className="alert alert-success"
          role="status"
          aria-live="polite"
          style={{ marginBottom: "20px" }}
        >
          <span>✓ {toastMessage}</span>
        </div>
      )}

      {errorMsg && (
        <ErrorMessage
          title="Editor Notice"
          message={errorMsg}
          code="ACTION_FAILED"
          onRetry={() => setErrorMsg(null)}
          className="mb-4"
        />
      )}

      {/* AI Synthesis & Manual Switch Strip (EL-030, EL-031) */}
      <div
        className="card"
        style={{
          padding: "16px 20px",
          marginBottom: "24px",
          backgroundColor: "var(--primary-subtle)",
          border: "1px solid var(--primary-border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div>
          <div
            style={{
              fontWeight: 700,
              fontSize: "14px",
              color: "var(--primary)",
            }}
          >
            Build your workflow
          </div>
          <div style={{ fontSize: "13px", color: "var(--ink-secondary)" }}>
            {workflow.origin === "ai_extracted"
              ? "Workflow synthesized with citations to source text."
              : "Extract structured requirements from uploaded circular document."}
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            type="button"
            data-testid="EL-030"
            className="btn btn-primary btn-sm"
            onClick={handleProposeAI}
            disabled={proposing || saving}
          >
            {proposing ? "Synthesizing..." : "Generate proposal"}
          </button>
          <button
            type="button"
            data-testid="EL-031"
            className="btn btn-secondary btn-sm"
            onClick={handleChooseManual}
          >
            Build manually
          </button>
        </div>
      </div>

      {/* Main Grid: 2 Columns */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(min(100%, 340px), 1fr))",
          gap: "24px",
        }}
      >
        {/* Left Column: Title, Deadline, Stages, Audience */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Workflow Title (EL-032) */}
          <div className="card">
            <h2 style={{ fontSize: "16px", marginBottom: "14px" }}>
              Workflow Title
            </h2>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="edit-workflow-title" className="form-label">
                Title *
              </label>
              <input
                id="edit-workflow-title"
                data-testid="EL-032"
                type="text"
                className="form-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter formal workflow title"
                minLength={5}
                maxLength={120}
              />
            </div>
          </div>

          {/* Set Application Deadline (EL-033) */}
          <div className="card">
            <h2 style={{ fontSize: "16px", marginBottom: "14px" }}>
              Application Timeline
            </h2>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="deadline-input" className="form-label">
                Initial Application Deadline *
              </label>
              <input
                id="deadline-input"
                data-testid="EL-033"
                type="datetime-local"
                className="form-input"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                required
              />
              <span className="form-hint">
                Late initial submissions are rejected. Resubmissions after
                requested changes remain accepted.
              </span>
            </div>
          </div>

          {/* Review Stages & Reviewer Selection (EL-038, EL-039) */}
          <div className="card">
            <h2 style={{ fontSize: "16px", marginBottom: "14px" }}>
              Sequential Review Stages
            </h2>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "16px" }}
            >
              {/* Stage 1 Reviewer */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="select-mentor-combobox" className="form-label">
                  Stage 1: Faculty Mentor *
                </label>
                <select
                  id="select-mentor-combobox"
                  data-testid="EL-038"
                  className="form-select"
                  value={stages[0]?.reviewerId || ""}
                  onChange={(e) => {
                    const newStages = [...stages];
                    if (!newStages[0])
                      newStages[0] = {
                        stageIndex: 0,
                        label: "Faculty Mentor Review",
                        reviewerId: "",
                      };
                    newStages[0].reviewerId = e.target.value;
                    setStages(newStages);
                  }}
                >
                  <option value="">-- Assign Faculty Reviewer --</option>
                  {reviewers.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.email})
                    </option>
                  ))}
                </select>
                <span className="form-hint">
                  Evaluates application feasibility and requests corrections.
                </span>
              </div>

              {/* Stage 2 Reviewer */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label
                  htmlFor="select-approver-combobox"
                  className="form-label"
                >
                  Stage 2: Final Approver (Dean / Authority) *
                </label>
                <select
                  id="select-approver-combobox"
                  data-testid="EL-039"
                  className="form-select"
                  value={stages[1]?.reviewerId || ""}
                  onChange={(e) => {
                    const newStages = [...stages];
                    if (!newStages[1])
                      newStages[1] = {
                        stageIndex: 1,
                        label: "Final Authority Approval",
                        reviewerId: "",
                      };
                    newStages[1].reviewerId = e.target.value;
                    setStages(newStages);
                  }}
                >
                  <option value="">
                    -- Assign Final Sanctioning Authority --
                  </option>
                  {reviewers.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.email})
                    </option>
                  ))}
                </select>
                <span className="form-hint">
                  Final sign-off; issues approval outcome.
                </span>
              </div>
            </div>
          </div>

          {/* Student Audience Selection (EL-040) */}
          <div className="card">
            <h2 style={{ fontSize: "16px", marginBottom: "8px" }}>
              Student recipients
            </h2>
            <p
              style={{
                fontSize: "13px",
                color: "var(--ink-secondary)",
                marginBottom: "12px",
              }}
            >
              Assign eligible students who will receive this workflow in their
              Process Hub.
            </p>

            <div
              data-testid="EL-040"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                maxHeight: "180px",
                overflowY: "auto",
                border: "1px solid var(--border-light)",
                borderRadius: "var(--radius-sm)",
                padding: "8px 12px",
              }}
            >
              {studentUsers.length === 0 ? (
                <div style={{ fontSize: "13px", color: "var(--ink-muted)" }}>
                  No student accounts available
                </div>
              ) : (
                studentUsers.map((stu) => {
                  const isChecked = selectedStudentIds.includes(stu.id);
                  return (
                    <label
                      key={stu.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        fontSize: "13px",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedStudentIds([
                              ...selectedStudentIds,
                              stu.id,
                            ]);
                          } else {
                            setSelectedStudentIds(
                              selectedStudentIds.filter((id) => id !== stu.id),
                            );
                          }
                        }}
                      />
                      <span>
                        <strong>{stu.name}</strong> ({stu.email})
                      </span>
                    </label>
                  );
                })
              )}
            </div>
            <div
              style={{
                marginTop: "6px",
                fontSize: "12px",
                color: "var(--ink-muted)",
              }}
            >
              {selectedStudentIds.length} students selected (max 50)
            </div>
          </div>
        </div>

        {/* Right Column: Source Evidence, Uncertainties, Dynamic Form Fields */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Source Document Evidence */}
          {workflow.sourceDocument && (
            <div className="card">
              <h2 style={{ fontSize: "16px", marginBottom: "8px" }}>
                Source instruction
              </h2>
              <textarea
                className="source-evidence-scroll"
                aria-label="Source instruction text"
                readOnly
                value={workflow.sourceDocument.extractedText}
              />
            </div>
          )}

          {/* Uncertainty List & Resolver (EL-041) */}
          <div className="card">
            <div className="card-header" style={{ marginBottom: "12px" }}>
              <div>
                <h2 style={{ fontSize: "16px" }}>Questions to resolve</h2>
                <p className="card-subtitle">
                  All uncertainties must be resolved before publication.
                </p>
              </div>
              <span
                className={`badge ${unresolvedUncertainties.length > 0 ? "badge-rejected" : "badge-published"}`}
              >
                {unresolvedUncertainties.length} Unresolved
              </span>
            </div>

            {uncertainties.length === 0 ? (
              <p
                style={{
                  fontSize: "13px",
                  color: "var(--ink-muted)",
                  margin: 0,
                }}
              >
                No ambiguities detected in proposal.
              </p>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                {uncertainties.map((u) => (
                  <div
                    key={u.id}
                    style={{
                      padding: "10px 14px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid",
                      borderColor: u.resolved
                        ? "var(--success-border)"
                        : "var(--warning-border)",
                      backgroundColor: u.resolved
                        ? "var(--success-bg)"
                        : "var(--warning-bg)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "13px" }}>
                        {u.kind}: {u.description}
                      </div>
                      {u.resolved && (
                        <div
                          style={{
                            fontSize: "12px",
                            color: "var(--success)",
                            marginTop: "2px",
                          }}
                        >
                          ✓ Resolved: {u.resolutionNote}
                        </div>
                      )}
                    </div>
                    {!u.resolved && (
                      <button
                        type="button"
                        data-testid="EL-041"
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleOpenResolve(u.id)}
                        style={{
                          padding: "0 8px",
                          minHeight: "32px",
                          fontSize: "12px",
                        }}
                      >
                        Resolve
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Dynamic Form Builder (EL-034, EL-035, EL-037) */}
          <div className="card">
            <div className="card-header" style={{ marginBottom: "14px" }}>
              <div>
                <h2 style={{ fontSize: "16px" }}>Application fields</h2>
                <p className="card-subtitle">
                  Required fields for student submission.
                </p>
              </div>
              <button
                type="button"
                data-testid="EL-034"
                className="btn btn-primary btn-sm"
                onClick={handleOpenAddField}
              >
                + Add Field
              </button>
            </div>

            {fields.length === 0 ? (
              <p style={{ fontSize: "13px", color: "var(--ink-muted)" }}>
                No form fields defined yet. Click &quot;Add Field&quot; or
                choose Manual Proposal.
              </p>
            ) : (
              <div
                style={{ display: "flex", flexDirection: "column", gap: "8px" }}
              >
                {fields.map((f, idx) => (
                  <div
                    key={f.key}
                    style={{
                      padding: "10px 14px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-light)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      backgroundColor: "var(--bg-card)",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "14px" }}>
                        {f.label}{" "}
                        {f.required && (
                          <span style={{ color: "var(--danger)" }}>*</span>
                        )}
                      </div>
                      <div
                        style={{ fontSize: "12px", color: "var(--ink-muted)" }}
                      >
                        Type: {f.type} • Key: {f.key}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        type="button"
                        data-testid="EL-035"
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleOpenEditField(idx)}
                        style={{
                          padding: "0 8px",
                          minHeight: "30px",
                          fontSize: "12px",
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        data-testid="EL-037"
                        className="btn btn-danger btn-sm"
                        onClick={() => handleRemoveField(idx)}
                        style={{
                          padding: "0 8px",
                          minHeight: "30px",
                          fontSize: "12px",
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Release & Publication Gate (EL-036) */}
      <section
        className="card"
        style={{
          marginTop: "32px",
          padding: "24px",
          border: canPublish
            ? "1px solid var(--success-border)"
            : "1px solid var(--warning-border)",
          backgroundColor: canPublish
            ? "var(--success-bg)"
            : "var(--bg-subtle)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "16px",
          }}
        >
          <div>
            <h2
              style={{
                fontSize: "18px",
                color: canPublish ? "var(--success)" : "var(--ink-primary)",
              }}
            >
              Ready to publish?
            </h2>
            <p
              style={{
                fontSize: "13px",
                color: "var(--ink-secondary)",
                marginTop: "4px",
              }}
            >
              Complete these requirements before making this workflow available
              to students.
            </p>

            <ul
              style={{
                listStyle: "none",
                padding: 0,
                marginTop: "10px",
                fontSize: "13px",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              <li
                style={{
                  color: titleValid ? "var(--success)" : "var(--danger)",
                }}
              >
                {titleValid ? "✓" : "✗"} Title has at least 5 characters
              </li>
              <li
                style={{
                  color: deadlineValid ? "var(--success)" : "var(--danger)",
                }}
              >
                {deadlineValid ? "✓" : "✗"} Application deadline set to future
                date
              </li>
              <li
                style={{
                  color: fieldsValid ? "var(--success)" : "var(--danger)",
                }}
              >
                {fieldsValid ? "✓" : "✗"} At least 1 dynamic form field defined
              </li>
              <li
                style={{
                  color: reviewerStage0Assigned
                    ? "var(--success)"
                    : "var(--danger)",
                }}
              >
                {reviewerStage0Assigned ? "✓" : "✗"} Stage 1 Mentor reviewer
                assigned
              </li>
              <li
                style={{
                  color: reviewerStage1Assigned
                    ? "var(--success)"
                    : "var(--danger)",
                }}
              >
                {reviewerStage1Assigned ? "✓" : "✗"} Stage 2 Final Authority
                reviewer assigned
              </li>
              <li
                style={{
                  color:
                    unresolvedUncertainties.length === 0
                      ? "var(--success)"
                      : "var(--danger)",
                }}
              >
                {unresolvedUncertainties.length === 0 ? "✓" : "✗"} Zero
                unresolved ambiguities ({unresolvedUncertainties.length}{" "}
                pending)
              </li>
              <li
                style={{
                  color: studentsValid ? "var(--success)" : "var(--danger)",
                }}
              >
                {studentsValid ? "✓" : "✗"} Eligible student cohort assigned (
                {selectedStudentIds.length} selected)
              </li>
            </ul>
          </div>

          <div>
            <button
              type="button"
              data-testid="EL-036"
              className="btn btn-primary"
              onClick={handlePublish}
              disabled={!canPublish || publishing || saving}
              style={{ minHeight: "48px", padding: "0 24px", fontSize: "15px" }}
            >
              {publishing ? "Publishing Workflow..." : "Publish workflow"}
            </button>
          </div>
        </div>
      </section>

      {/* Field Editor Dialog */}
      <Dialog
        isOpen={fieldModalOpen}
        onClose={() => setFieldModalOpen(false)}
        title={
          editingFieldIndex !== null ? "Edit Form Field" : "Add Form Field"
        }
        description="Configure field properties and applicant schema validation"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="temp-field-label" className="form-label">
              Field Label *
            </label>
            <input
              id="temp-field-label"
              type="text"
              className="form-input"
              value={tempField.label}
              onChange={(e) =>
                setTempField({ ...tempField, label: e.target.value })
              }
              placeholder="e.g. Company Offer Letter"
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="temp-field-type" className="form-label">
              Field Type
            </label>
            <select
              id="temp-field-type"
              className="form-select"
              value={tempField.type}
              onChange={(e) =>
                setTempField({
                  ...tempField,
                  type: e.target.value as DynamicField["type"],
                })
              }
            >
              <option value="text">Text (Single Line)</option>
              <option value="date">Date</option>
              <option value="select">Selection list</option>
              <option value="file">
                File Attachment (PDF / Image ≤ 5 MiB)
              </option>
            </select>
          </div>

          {tempField.type === "select" && (
            <div className="form-group">
              <label htmlFor="field-options" className="form-label">
                Options, one per line
              </label>
              <textarea
                id="field-options"
                className="form-textarea"
                value={(tempField.options || []).join("\n")}
                onChange={(event) =>
                  setTempField({
                    ...tempField,
                    options: event.target.value.split("\n"),
                  })
                }
                placeholder="Research project\nIndustry internship\nCommunity initiative"
              />
              <span className="form-hint">Add up to 20 distinct choices.</span>
            </div>
          )}

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={tempField.required}
              onChange={(e) =>
                setTempField({ ...tempField, required: e.target.checked })
              }
            />
            <span>Mandatory (Applicant must complete)</span>
          </label>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "10px",
              marginTop: "12px",
            }}
          >
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setFieldModalOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleSaveField}
              disabled={!tempField.label.trim()}
            >
              Save Field
            </button>
          </div>
        </div>
      </Dialog>

      {/* Uncertainty Resolution Dialog */}
      <Dialog
        isOpen={Boolean(resolvingUncertaintyId)}
        onClose={() => setResolvingUncertaintyId(null)}
        title="Resolve Ambiguity / Uncertainty"
        description="Provide justification note for audit verification before clearing this gate"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="resolution-note-input" className="form-label">
              Resolution Note *
            </label>
            <textarea
              id="resolution-note-input"
              className="form-textarea"
              rows={3}
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              placeholder="e.g. Verified with Department Academic Committee on 16 Nov 2026."
            />
          </div>

          <div
            style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}
          >
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setResolvingUncertaintyId(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleConfirmResolve}
            >
              Confirm Resolution
            </button>
          </div>
        </div>
      </Dialog>

      {/* Student Form Preview Dialog (EL-043) */}
      <Dialog
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        title="Student Form Preview"
        description="Read-only view of how students in the target cohort will see this submission form"
        maxWidth="640px"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div
            style={{
              padding: "12px",
              background: "var(--bg-subtle)",
              borderRadius: "var(--radius-md)",
            }}
          >
            <h3 style={{ fontSize: "16px", margin: 0 }}>
              {title || "Untitled Workflow"}
            </h3>
            <p
              style={{
                fontSize: "13px",
                color: "var(--ink-muted)",
                marginTop: "4px",
              }}
            >
              Deadline:{" "}
              {deadline
                ? new Date(deadline).toLocaleString()
                : "No deadline set"}
            </p>
          </div>

          {fields.map((f) => (
            <div key={f.key} className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">
                {f.label}{" "}
                {f.required && (
                  <span style={{ color: "var(--danger)" }}>*</span>
                )}
              </label>
              {f.type === "file" ? (
                <input type="file" className="form-input" disabled />
              ) : f.type === "select" ? (
                <select className="form-input" aria-label={f.label} disabled>
                  {f.options?.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={f.type}
                  className="form-input"
                  placeholder={f.placeholder}
                  disabled
                />
              )}
            </div>
          ))}

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: "12px",
            }}
          >
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setShowPreview(false)}
            >
              Close Preview
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
