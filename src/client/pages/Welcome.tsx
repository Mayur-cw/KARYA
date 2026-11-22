import React from 'react';

export default function Welcome() {
  return (
    <div className="card" data-testid="page-p-001">
      <div className="card-header">
        <div>
          <span className="badge badge-draft" style={{ marginBottom: '8px' }}>P-001</span>
          <h1>Welcome</h1>
          <p className="card-subtitle">Route: /</p>
        </div>
      </div>
      <p>Initializing institutional workflow view...</p>
    </div>
  );
}
