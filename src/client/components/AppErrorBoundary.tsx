import React from 'react';
export class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div className="fatal-error" role="alert"><h1>Let’s get you back on track.</h1><p>This page couldn’t be displayed. Reload the workspace to try again.</p><button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>Reload workspace</button></div>;
    return this.props.children;
  }
}
