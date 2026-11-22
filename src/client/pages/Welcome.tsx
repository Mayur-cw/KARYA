import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';
import { Dialog } from '../components/Dialog';
import { Icon } from '../components/Icon';
import { api } from '../api';

export default function Welcome() {
  const { user, role } = useAuth();
  const [health, setHealth] = useState<'checking' | 'ok' | 'error'>('checking');
  const [showGuide, setShowGuide] = useState(false);
  useEffect(() => {
    let active = true;
    api<{ status: string }>('/healthz').then(data => { if (active) setHealth(data.status === 'ok' ? 'ok' : 'error'); }).catch(() => { if (active) setHealth('error'); });
    return () => { active = false; };
  }, []);
  return <div className="welcome-page" data-testid="page-p-001">
    <section className="welcome-hero">
      <div className="welcome-hero-copy"><div className="eyebrow">Institutional operations, reimagined</div><h1>Clear instructions.<br />Connected people.<br /><em>Work that moves.</em></h1><p>Bring your institution’s applications, approvals, and decisions into one thoughtful workspace. Less chasing updates. More getting things done.</p><div className="welcome-actions">
        {role === 'anonymous' ? <Link to="/login" data-testid="EL-001" className="btn btn-primary">Sign in to KARYA</Link> : <Link to={`/${role}`} data-testid={role === 'admin' ? 'EL-002' : role === 'student' ? 'EL-003' : 'EL-004'} className="btn btn-primary">Open {role === 'admin' ? 'Admin' : role === 'student' ? 'Student' : 'Review'} Workspace</Link>}
        <button type="button" className="btn btn-secondary" data-testid="EL-005" onClick={() => setShowGuide(true)}>How KARYA works</button>
      </div><div className={`service-status ${health}`} role="status"><i aria-hidden="true" />{health === 'ok' ? 'System ready · Your next step starts here' : health === 'checking' ? 'Checking workspace availability…' : 'Service unavailable · Please try again shortly'}</div></div>
      <div className="welcome-visual" aria-label="From instruction to resolution"><p className="welcome-visual-heading">ONE CONNECTED PROCESS</p><div className="journey-node"><Icon name="file" size={25} /><div><strong>Make the requirements clear</strong><p>A defined process starts with an instruction.</p></div></div><div className="journey-connector" /><div className="journey-node"><Icon name="layers" size={25} /><div><strong>Bring the right people together</strong><p>Students, reviewers, and administrators.</p></div></div><div className="journey-connector" /><div className="journey-node"><Icon name="check" size={25} /><div><strong>Reach a recorded decision</strong><p>Every action becomes part of the story.</p></div></div></div>
    </section>
    <section aria-labelledby="workspace-features"><div className="welcome-section-heading"><div><div className="eyebrow">Built around your next step</div><h2 id="workspace-features">A little clarity goes a long way.</h2></div><p>A dedicated space for every role, with one process connecting them all.</p></div><div className="feature-grid">
      <article className="card feature-card"><Icon name="sparkle" size={26} /><h3>From instructions to action</h3><p>Build workflows from official requirements. Set deadlines, assign reviewers, and resolve open questions before publishing.</p></article>
      <article className="card feature-card"><Icon name="layers" size={26} /><h3>Everything in its place</h3><p>Find assigned processes, complete applications, attach documents, and respond to feedback in your own workspace.</p></article>
      <article className="card feature-card"><Icon name="shield" size={26} /><h3>Decisions you can follow</h3><p>Review one stage at a time. Keep feedback clear and decisions traceable, with notifications along the way.</p></article>
    </div></section>
    <div className="welcome-session"><p>{user ? <>Signed in as <strong>{user.name}</strong> · {user.role}</> : 'A shared workspace. The right access for each person.'}</p><Link to={user ? '/account' : '/login'}>{user ? 'Manage your session' : 'Explore demo accounts'}</Link></div>
    <Dialog isOpen={showGuide} onClose={() => setShowGuide(false)} title="How KARYA works" description="From an official instruction to a recorded outcome."><div className="guide-steps"><h3>Define the process</h3><p>Administrators create a draft, confirm its requirements, and assign reviewers and student recipients before publishing.</p><h3>Complete the application</h3><p>Students open an assigned workflow, complete the required information, and submit their supporting documents.</p><h3>Review and resolve</h3><p>Assigned reviewers approve, reject, or request corrections. Notifications and an audit trail keep the process traceable.</p><button type="button" className="btn btn-primary" onClick={() => setShowGuide(false)}>Got it</button></div></Dialog>
  </div>;
}
