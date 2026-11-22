import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './components/AuthContext';
import { Header } from './components/Header';
import { WorkspaceLayout } from './components/WorkspaceLayout';
import { RoleGuard } from './components/RoleGuard';
import { LoadingSkeleton } from './components/LoadingSkeleton';

// Lazy-load all 19 application routes
const Welcome = lazy(() => import('./pages/Welcome'));
const DemoSignIn = lazy(() => import('./pages/DemoSignIn'));
const AdminCommandCenter = lazy(() => import('./pages/AdminCommandCenter'));
const WorkflowRegistry = lazy(() => import('./pages/WorkflowRegistry'));
const InstructionIntake = lazy(() => import('./pages/InstructionIntake'));
const WorkflowEditor = lazy(() => import('./pages/WorkflowEditor'));
const WorkflowOverview = lazy(() => import('./pages/WorkflowOverview'));
const ProcessMonitor = lazy(() => import('./pages/ProcessMonitor'));
const StudentProcessHub = lazy(() => import('./pages/StudentProcessHub'));
const ProcessRequirements = lazy(() => import('./pages/ProcessRequirements'));
const SubmissionWorkspace = lazy(() => import('./pages/SubmissionWorkspace'));
const ReviewerInbox = lazy(() => import('./pages/ReviewerInbox'));
const ReviewWorkbench = lazy(() => import('./pages/ReviewWorkbench'));
const Notifications = lazy(() => import('./pages/Notifications'));
const MyAccount = lazy(() => import('./pages/MyAccount'));
const AuditExplorer = lazy(() => import('./pages/AuditExplorer'));
const AccessDenied = lazy(() => import('./pages/AccessDenied'));
const PageNotFound = lazy(() => import('./pages/PageNotFound'));
const SubmissionInspector = lazy(() => import('./pages/SubmissionInspector'));

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <WorkspaceLayout>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <Header />
        <main tabIndex={-1} id="main-content" className="main-content" role="main">
          <Suspense fallback={<LoadingSkeleton label="Loading workspace..." lines={4} />}>
            <Routes>
              {/* Public & Authentication */}
              <Route path="/" element={<Welcome />} />
              <Route path="/login" element={<DemoSignIn />} />

              {/* Administrator Workspace (P-003..P-008, P-016, P-019) */}
              <Route
                path="/admin"
                element={
                  <RoleGuard allowedRoles={['admin']}>
                    <AdminCommandCenter />
                  </RoleGuard>
                }
              />
              <Route
                path="/admin/workflows"
                element={
                  <RoleGuard allowedRoles={['admin']}>
                    <WorkflowRegistry />
                  </RoleGuard>
                }
              />
              <Route
                path="/admin/studio"
                element={
                  <RoleGuard allowedRoles={['admin']}>
                    <InstructionIntake />
                  </RoleGuard>
                }
              />
              <Route
                path="/admin/workflows/:workflowId/edit"
                element={
                  <RoleGuard allowedRoles={['admin']}>
                    <WorkflowEditor />
                  </RoleGuard>
                }
              />
              <Route
                path="/admin/workflows/:workflowId"
                element={
                  <RoleGuard allowedRoles={['admin']}>
                    <WorkflowOverview />
                  </RoleGuard>
                }
              />
              <Route
                path="/admin/workflows/:workflowId/monitor"
                element={
                  <RoleGuard allowedRoles={['admin']}>
                    <ProcessMonitor />
                  </RoleGuard>
                }
              />
              <Route
                path="/admin/audit"
                element={
                  <RoleGuard allowedRoles={['admin']}>
                    <AuditExplorer />
                  </RoleGuard>
                }
              />
              <Route
                path="/admin/submissions/:submissionId"
                element={
                  <RoleGuard allowedRoles={['admin']}>
                    <SubmissionInspector />
                  </RoleGuard>
                }
              />

              {/* Student Workspace (P-009..P-011) */}
              <Route
                path="/student"
                element={
                  <RoleGuard allowedRoles={['student']}>
                    <StudentProcessHub />
                  </RoleGuard>
                }
              />
              <Route
                path="/student/workflows/:workflowId"
                element={
                  <RoleGuard allowedRoles={['student']}>
                    <ProcessRequirements />
                  </RoleGuard>
                }
              />
              <Route
                path="/student/submissions/:submissionId"
                element={
                  <RoleGuard allowedRoles={['student']}>
                    <SubmissionWorkspace />
                  </RoleGuard>
                }
              />

              {/* Reviewer Workspace (P-012..P-013) */}
              <Route
                path="/reviewer"
                element={
                  <RoleGuard allowedRoles={['reviewer']}>
                    <ReviewerInbox />
                  </RoleGuard>
                }
              />
              <Route
                path="/reviewer/submissions/:submissionId"
                element={
                  <RoleGuard allowedRoles={['reviewer']}>
                    <ReviewWorkbench />
                  </RoleGuard>
                }
              />

              {/* Shared Role Operations (P-014..P-015) */}
              <Route
                path="/notifications"
                element={
                  <RoleGuard allowedRoles={['admin', 'student', 'reviewer']}>
                    <Notifications />
                  </RoleGuard>
                }
              />
              <Route
                path="/account"
                element={
                  <RoleGuard allowedRoles={['admin', 'student', 'reviewer']}>
                    <MyAccount />
                  </RoleGuard>
                }
              />

              {/* Fallback & Access Control Exceptions (P-017..P-018) */}
              <Route path="/403" element={<AccessDenied />} />
              <Route path="*" element={<PageNotFound />} />
            </Routes>
          </Suspense>
        </main>
        <footer className="app-footer" role="contentinfo">
          <div className="footer-container">
            <div>
              <strong>KARYA</strong><span> Clarity at every step.</span>
            </div>
            <div>Institutional operations workspace</div>
          </div>
        </footer>
      </WorkspaceLayout>
      </AuthProvider>
    </BrowserRouter>
  );
}
