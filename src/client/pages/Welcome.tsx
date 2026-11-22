import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';
import { Dialog } from '../components/Dialog';
import { api } from '../api';

export default function Welcome() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const [healthStatus, setHealthStatus] = useState<'ok' | 'checking' | 'error'>('checking');
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  useEffect(() => {
    let mounted = true;
    api<{ status: string }>('/healthz')
      .then((data) => {
        if (mounted && data.status === 'ok') {
          setHealthStatus('ok');
        }
      })
      .catch(() => {
        if (mounted) setHealthStatus('error');
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="welcome-page" data-testid="page-p-001">
      {/* Hero Section */}
      <section
        className="card"
        style={{
          marginBottom: '32px',
          padding: '40px 32px',
          background: 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)',
          border: '1px solid var(--border-light)',
        }}
      >
        <div style={{ maxWidth: '800px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <span className="badge badge-published">National Hackathon System</span>
            {healthStatus === 'ok' && (
              <span className="badge badge-published" aria-live="polite">
                ● System Ready
              </span>
            )}
            {healthStatus === 'checking' && (
              <span className="badge badge-draft">Connecting...</span>
            )}
            {healthStatus === 'error' && (
              <span className="badge badge-rejected">Service Offline</span>
            )}
          </div>

          <h1 style={{ marginBottom: '16px', letterSpacing: '-0.02em' }}>
            From Instructions to Execution. <br />
            From Requests to Resolution.
          </h1>

          <p style={{ fontSize: '18px', color: 'var(--ink-secondary)', marginBottom: '28px', lineHeight: 1.6 }}>
            KARYA is an institutional operations desk for high-stakes governance. It ingests official circulars, synthesizes structured, explainable approval workflows, and orchestrates submissions across students, faculty mentors, and final institutional authorities with mathematical auditability.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
            {role === 'anonymous' && (
              <button
                type="button"
                data-testid="EL-001"
                className="btn btn-primary"
                onClick={() => navigate('/login')}
              >
                Sign in to KARYA
              </button>
            )}

            {role === 'admin' && (
              <Link
                to="/admin"
                data-testid="EL-002"
                className="btn btn-primary"
              >
                Open Admin Workspace
              </Link>
            )}

            {role === 'student' && (
              <Link
                to="/student"
                data-testid="EL-003"
                className="btn btn-primary"
              >
                Open Student Workspace
              </Link>
            )}

            {role === 'reviewer' && (
              <Link
                to="/reviewer"
                data-testid="EL-004"
                className="btn btn-primary"
              >
                Open Review Workspace
              </Link>
            )}

            <button
              type="button"
              data-testid="EL-005"
              className="btn btn-secondary"
              onClick={() => setShowHowItWorks(true)}
            >
              How KARYA Works
            </button>
          </div>
        </div>
      </section>

      {/* 3-Step Product Story */}
      <section style={{ marginBottom: '36px' }}>
        <h2 style={{ marginBottom: '20px', fontSize: '20px', fontWeight: 700 }}>
          Three-Stage Institutional Architecture
        </h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '20px',
          }}
        >
          <div className="card">
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: 'var(--primary-subtle)',
                color: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                marginBottom: '16px',
              }}
            >
              1
            </div>
            <h3 style={{ marginBottom: '8px' }}>Instruction Intake & Synthesis</h3>
            <p style={{ fontSize: '14px', lineHeight: 1.6 }}>
              Administrators upload official PDFs or mandates. Grounded AI extraction proposes structured requirements with exact character offsets. Ambiguity and missing reviewers block publication until resolved.
            </p>
          </div>

          <div className="card">
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: 'var(--primary-subtle)',
                color: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                marginBottom: '16px',
              }}
            >
              2
            </div>
            <h3 style={{ marginBottom: '8px' }}>Hardened Student Execution</h3>
            <p style={{ fontSize: '14px', lineHeight: 1.6 }}>
              Eligible student cohorts complete schema-validated dynamic forms and attach tamper-evident PDF/image credentials under 5 MiB with magic byte verification. Submissions are owner-scoped and IDOR-shielded.
            </p>
          </div>

          <div className="card">
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: 'var(--primary-subtle)',
                color: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                marginBottom: '16px',
              }}
            >
              3
            </div>
            <h3 style={{ marginBottom: '8px' }}>Human Review & Immutable Audit</h3>
            <p style={{ fontSize: '14px', lineHeight: 1.6 }}>
              Multi-stage review pipelines enforce sequential approval atomics. Faculty mentors can request corrections with mandatory justifications. All transitions produce immutable, queryable audit events.
            </p>
          </div>
        </div>
      </section>

      {/* Role Scoped Access Overview */}
      <section className="card">
        <h2 style={{ fontSize: '18px', marginBottom: '8px' }}>Active Persona Status</h2>
        <p style={{ fontSize: '14px', marginBottom: '16px' }}>
          {user ? (
            <>
              Currently signed in as <strong>{user.name}</strong> ({user.role}) • {user.email}.
            </>
          ) : (
            'You are exploring KARYA in guest preview mode. Sign in with a seeded demo persona to experience full operational flows.'
          )}
        </p>
        <div style={{ display: 'flex', gap: '12px' }}>
          {role === 'anonymous' ? (
            <Link to="/login" className="btn btn-secondary btn-sm">
              View Available Personas
            </Link>
          ) : (
            <Link to="/account" className="btn btn-secondary btn-sm">
              Manage Active Session
            </Link>
          )}
        </div>
      </section>

      {/* How KARYA Works Dialog (EL-005) */}
      <Dialog
        isOpen={showHowItWorks}
        onClose={() => setShowHowItWorks(false)}
        title="How KARYA Functions"
        description="Core technical guarantees of the KARYA operations engine"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '14px', lineHeight: 1.6 }}>
          <div>
            <strong>1. Explainable Instruction Ingestion</strong>
            <p style={{ color: 'var(--ink-secondary)', marginTop: '4px' }}>
              Official administrative directives, circulars, and syllabi are processed using REST-based AI adapters. Every extracted requirement links back to exact character span offsets in the raw source.
            </p>
          </div>

          <div>
            <strong>2. Hard Publishing Gate</strong>
            <p style={{ color: 'var(--ink-secondary)', marginTop: '4px' }}>
              Unlike generic workflow builders, KARYA rejects publication if a deadline is missing, reviewers are unassigned, or uncertainties remain unresolved. No incomplete workflows reach students.
            </p>
          </div>

          <div>
            <strong>3. Atomic Multi-Stage Decisions</strong>
            <p style={{ color: 'var(--ink-secondary)', marginTop: '4px' }}>
              Decisions execute inside SQLite transactions. Mentors approve or request changes with detailed notes; submissions advance sequentially from Stage 0 to Stage 1 to final resolution without skipped gates.
            </p>
          </div>

          <div>
            <strong>4. Zero-Tolerance Integrity & Auditing</strong>
            <p style={{ color: 'var(--ink-secondary)', marginTop: '4px' }}>
              Attachments are inspected for true magic byte signatures, stored with randomized keys outside web roots, and shielded against cross-tenant IDOR access. Departmental exports sanitize CSV formula injections.
            </p>
          </div>

          <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setShowHowItWorks(false)}
            >
              Close Guide
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
