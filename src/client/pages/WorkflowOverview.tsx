import React from 'react';

export default function WorkflowOverview() {
  return (
    <div className="card" data-testid="page-p-007">
      <div className="card-header">
        <div>
          <span className="badge badge-draft" style={{ marginBottom: '8px' }}>P-007</span>
          <h1>Workflow overview</h1>
          <p className="card-subtitle">Route: /admin/workflows/:workflowId</p>
        </div>
      </div>
      <p>Initializing institutional workflow view...</p>
    </div>
  );
}
