import React from 'react';

export default function AccessDenied() {
  return (
    <div className="card" data-testid="page-p-017">
      <div className="card-header">
        <div>
          <span className="badge badge-draft" style={{ marginBottom: '8px' }}>P-017</span>
          <h1>Access denied</h1>
          <p className="card-subtitle">Route: /403</p>
        </div>
      </div>
      <p>Initializing institutional workflow view...</p>
    </div>
  );
}
