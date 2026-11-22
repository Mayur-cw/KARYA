import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ErrorMessage } from '../components/ErrorMessage';
import { api } from '../api';

const SAMPLE_CIRCULAR = `NATIONAL INSTITUTE OF ENGINEERING & TECHNOLOGY
Department of Computer Science & Engineering
Circular Ref: NIET/CSE/2026/INTERN-04
Date: 15 November 2026

SUBJECT: MANDATORY SUMMER RESEARCH & INDUSTRIAL INTERNSHIP PROGRAM 2026

1. ELIGIBILITY & SCOPE:
All 3rd Year B.Tech Computer Science and Engineering students are eligible and required to complete a 10-week summer research internship.

2. SUBMISSION REQUIREMENTS:
Each student must submit:
a) Company/Lab Offer Letter signed by authorized sponsor.
b) Project Synopsis (maximum 1000 words outlining research scope).
c) Faculty Mentor Recommendation Form.

3. HARD TIMELINE:
- Initial Application Deadline: 15 December 2026, 17:00 IST.
- Late submissions will NOT be accepted for initial registration.
- If revision is requested by faculty mentor, resubmission is permitted within 7 working days.

4. MULTI-STAGE APPROVAL WORKFLOW:
Stage 0 (Department Mentor Review): Prof. Priya Iyer will verify corporate credentials, academic alignment, and project feasibility.
Stage 1 (Final Authority Review): Dean R. K. Nair will provide final institutional sanction and NOC issuance.

Failure to complete this process will result in internship credit deferral.
`;

export default function InstructionIntake() {
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [instructionText, setInstructionText] = useState('');
  const [uploadedSource, setUploadedSource] = useState<{
    id: string;
    fileName: string;
    byteSize: number;
    sha256: string;
  } | null>(null);

  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
      setErrorMsg('Only text-based PDF documents are supported for official circular ingestion');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('PDF file exceeds the maximum bound of 5 MiB');
      return;
    }

    setUploading(true);
    setErrorMsg(null);

    try {
      const result = await api<{ id: string; sha256: string }>('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/pdf', 'x-document-title': encodeURIComponent(file.name) },
        body: file,
      });
      setUploadedSource({ ...result, fileName: file.name, byteSize: file.size });
      if (!title) {
        setTitle(file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '));
      }
      setToastMessage('PDF source uploaded and verified successfully');
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Source upload failed');
    } finally {
      setUploading(false);
      // Reset input value so same file can be reselected if needed
      e.target.value = '';
    }
  };

  const handleRemoveSource = async () => {
    if (!uploadedSource) return;

    setUploading(true);
    setErrorMsg(null);

    try {
      await api(`/api/documents/${uploadedSource.id}`, { method: 'DELETE' });
      setUploadedSource(null);
      setToastMessage('Source document removed');
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to delete source');
    } finally {
      setUploading(false);
    }
  };

  const handleCreateWorkflow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 5) {
      setErrorMsg('Workflow title must be at least 5 characters');
      return;
    }

    if (!uploadedSource && !instructionText.trim()) {
      setErrorMsg('Please upload a PDF circular or enter raw instruction text');
      return;
    }

    setCreating(true);
    setErrorMsg(null);

    try {
      const payload: {
        title: string;
        description?: string;
        sourceId?: string;
        rawText?: string;
      } = {
        title: title.trim(),
        description: instructionText.trim() ? instructionText.slice(0, 200) : 'Imported from circular document',
      };

      if (uploadedSource) {
        payload.sourceId = uploadedSource.id;
      }
      if (instructionText.trim()) {
        payload.rawText = instructionText.trim();
      }

      const workflow = await api<{ id: string }>('/api/workflows', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      // On success, navigate to P-006 Explainable workflow editor
      navigate(`/admin/workflows/${workflow.id}/edit`);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create workflow draft');
    } finally {
      setCreating(false);
    }
  };

  const canSubmit = title.trim().length >= 5 && (Boolean(uploadedSource) || Boolean(instructionText.trim()));

  return (
    <div className="instruction-intake-page" data-testid="page-p-005" style={{ maxWidth: '880px', margin: '0 auto' }}>
      {/* Return to Registry link (EL-029) */}
      <div style={{ marginBottom: '16px' }}>
        <Link to="/admin/workflows" data-testid="EL-029" className="btn btn-secondary btn-sm">
          Return to Registry
        </Link>
      </div>

      <div className="card-header" style={{ marginBottom: '24px' }}>
        <div>
          <span className="badge badge-published" style={{ marginBottom: '8px' }}>
            Intake Studio
          </span>
          <h1>Intake studio</h1>
          <p className="card-subtitle">
            Start with an official instruction. Build a clear process for the people who need to act on it.
          </p>
        </div>
      </div>

      {toastMessage && (
        <div className="alert alert-success" role="status" aria-live="polite" style={{ marginBottom: '20px' }}>
          <span>✓ {toastMessage}</span>
        </div>
      )}

      {errorMsg && (
        <ErrorMessage
          title="Intake Error"
          message={errorMsg}
          code="INTAKE_FAILED"
          onRetry={() => setErrorMsg(null)}
          className="mb-4"
        />
      )}

      <form onSubmit={handleCreateWorkflow}>
        {/* EL-027 Workflow Title */}
        <div className="card" style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: '18px', marginBottom: '16px' }}>Name your workflow</h2>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="workflow-title-input" className="form-label">
              Workflow Title *
            </label>
            <input
              id="workflow-title-input"
              data-testid="EL-027"
              type="text"
              className="form-input"
              placeholder="e.g. Summer Research Internship 2026 Application"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              minLength={5}
              maxLength={120}
              required
              disabled={creating}
            />
            <span className="form-hint">
              Between 5 and 120 characters. Will appear in student and reviewer workbenches.
            </span>
          </div>
        </div>

        {/* Source Ingestion Section */}
        <div className="card" style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: '18px', marginBottom: '8px' }}>2. Circular Document or Instruction Ingestion</h2>
          <p style={{ fontSize: '14px', color: 'var(--ink-secondary)', marginBottom: '20px' }}>
            Provide either an official text-based PDF or enter plain regulation text. Review the proposed requirements and confirm open questions before publishing.
          </p>

          {/* PDF Upload (EL-026, EL-025) */}
          <div
            style={{
              padding: '20px',
              borderRadius: 'var(--radius-md)',
              border: '2px dashed var(--border-medium)',
              backgroundColor: 'var(--bg-subtle)',
              marginBottom: '20px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <label htmlFor="pdf-upload-input" className="form-label" style={{ display: 'block', marginBottom: '4px' }}>
                  Option A: Upload Official Text PDF (≤ 5 MiB)
                </label>
                <span className="form-hint" style={{ display: 'block', marginBottom: '12px' }}>
                  Supports machine-readable PDF circulars. SHA-256 integrity hash is computed immediately.
                </span>
                <input
                  id="pdf-upload-input"
                  data-testid="EL-026"
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={handleFileUpload}
                  disabled={uploading || creating}
                  style={{ fontSize: '14px' }}
                />
              </div>

              {uploadedSource && (
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--success-border)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--success)', fontWeight: 700 }}>✓ Attached:</span>
                    <span style={{ fontWeight: 600, fontSize: '14px' }}>{uploadedSource.fileName}</span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--ink-muted)', marginBottom: '8px' }}>
                    {(uploadedSource.byteSize / 1024).toFixed(1)} KiB • Hash: {uploadedSource.sha256.substring(0, 12)}...
                  </div>
                  <button
                    type="button"
                    data-testid="EL-025"
                    className="btn btn-danger btn-sm"
                    onClick={handleRemoveSource}
                    disabled={uploading || creating}
                  >
                    Remove Source Document
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Option B: Raw Text (EL-024) */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label htmlFor="instruction-textarea" className="form-label">
                Option B: Raw Instruction Text
              </label>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setInstructionText(SAMPLE_CIRCULAR);
                  if (!title) setTitle('Summer Research Internship 2026');
                }}
                disabled={creating}
                style={{ padding: '0 8px', minHeight: '32px', fontSize: '12px' }}
              >
                Paste Sample Circular
              </button>
            </div>
            <textarea
              id="instruction-textarea"
              data-testid="EL-024"
              className="form-textarea"
              placeholder="Paste official notification text, circular directives, or regulations here..."
              rows={8}
              value={instructionText}
              onChange={(e) => setInstructionText(e.target.value)}
              maxLength={100000}
              disabled={creating}
              style={{ minHeight: '180px', fontFamily: 'var(--font-mono)', fontSize: '13px' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
              <span className="form-hint">
                Trimmed input bounded to 100k characters. Character offsets are computed automatically.
              </span>
              <span style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>
                {instructionText.length} / 100,000
              </span>
            </div>
          </div>
        </div>

        {/* Action Button (EL-028) */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', alignItems: 'center' }}>
          <Link to="/admin/workflows" className="btn btn-secondary">
            Cancel
          </Link>
          <button
            type="submit"
            data-testid="EL-028"
            className="btn btn-primary"
            disabled={!canSubmit || creating || uploading}
          >
            {creating ? 'Creating Workflow Draft...' : 'Create Editable Workflow'}
          </button>
        </div>
      </form>
    </div>
  );
}
