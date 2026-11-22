import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig } from './config.js';
import {
  authenticate,
  requireAuth,
  requireRoles,
  requireAnonymous,
  checkStudentOwnership,
  denyPrivateObject,
} from './authz.js';
import {
  csrfProtection,
  loginRateLimiter,
  uploadRateLimiter,
  aiRateLimiter,
  writeRateLimiter,
  readRateLimiter,
  setSessionCookie,
  clearSessionCookie,
  parseCookies,
  SESSION_COOKIE_NAME,
} from './security.js';
import {
  handlePostDocument,
  handleGetDocument,
  handlePatchDocument,
  handleDeleteDocument,
  handleProposeWorkflow,
} from './modules/private-source-extraction-ai-proposal-adapter.js';
import {
  handlePostWorkflow,
  handleGetWorkflows,
  handleGetWorkflowById,
  handlePatchWorkflow,
  handlePublishWorkflow,
  handleArchiveWorkflow,
} from './modules/workflow-draft-publish-gate.js';
import {
  handleGetUsers,
  handlePostUser,
  handleGetUserById,
  handlePatchUserById,
  handleGetAssignments,
  handlePostWorkflowAssignments,
  handlePatchAssignment,
  handleDeleteAssignment,
} from './modules/cohort-eligibility-assignee-policies.js';
import {
  handlePostWorkflowSubmissions,
  handleGetSubmissions,
  handleGetSubmissionById,
  handlePatchSubmission,
  handleSubmitSubmission,
  handleDeleteSubmission,
} from './modules/dynamic-submissions-deadlines.js';
import { handlePostSubmissionDecision } from './modules/multi-stage-review-atomics.js';
import {
  handlePostAttachment,
  handleGetAttachment,
  handlePatchAttachment,
  handleDeleteAttachment,
} from './modules/private-upload-references-file-streaming.js';
import {
  handleGetNotifications,
  handlePatchNotification,
  handleDeleteNotification,
  handleGetWorkflowAnalytics,
} from './modules/notification-delivery-live-dashboards.js';
import {
  handleGetAuditLogs,
  handleGetWorkflowReportCsv,
  handleGetHealthz,
} from './modules/audit-explorer-csv-report-healthz.js';
import {
  createSession,
  deleteSessionByToken,
  SEEDED_USERS,
} from './session.js';
import { getDb, UserRepository } from './repository.js';
import { demoLoginRequestSchema, type UserPublic } from '../shared/contracts.js';

export function createApp() {
  const config = getConfig();
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
        },
      },
    })
  );

  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        const allowed = config.ALLOWED_ORIGINS.split(',').map((x) => x.trim());
        if (allowed.includes(origin)) return cb(null, true);
        try {
          const url = new URL(origin);
          if (
            url.hostname.endsWith('.onrender.com') ||
            url.hostname.endsWith('.railway.app') ||
            url.hostname.endsWith('.run.app') ||
            url.hostname.endsWith('.vercel.app') ||
            url.hostname.endsWith('.koyeb.app') ||
            url.hostname.endsWith('.fly.dev')
          ) {
            return cb(null, true);
          }
        } catch {
          // ignore malformed URL
        }
        if (config.NODE_ENV === 'development') {
          try {
            const url = new URL(origin);
            if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname.startsWith('192.168.') || url.hostname.startsWith('10.') || /^172\.(1[6-9]|2\d|3[0-1])\./.test(url.hostname)) {
              return cb(null, true);
            }
          } catch {
            // invalid URL
          }
        }
        return cb(null, false);
      },
      credentials: true,
    })
  );

  app.use(
    rateLimit({
      windowMs: 15 * 60_000,
      limit: 500,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      validate: { xForwardedForHeader: false },
    })
  );

  app.use(express.json({ limit: '64kb' }));

  // Health check endpoints (EP-040 + /healthz)
  app.get('/healthz', handleGetHealthz);
  app.get('/api/healthz', handleGetHealthz);

  // Attach authentication context to all API routes
  app.use('/api', authenticate);

  // CSRF protection for mutating API requests
  app.use('/api', csrfProtection);

  // ==========================================
  // Auth Endpoints (EP-001, EP-002, EP-003)
  // ==========================================

  const requireDemoMode: import('express').RequestHandler = (_req, res, next) => {
    if (config.DEMO_MODE !== 'true') {
      res.status(403).json({ code: 'DEMO_DISABLED', message: 'Demo sign-in is disabled. Contact your administrator for access.' });
      return;
    }
    next();
  };

  // EP-001 POST /api/auth/demo-login
  app.post('/api/auth/demo-login', requireDemoMode, requireAnonymous, loginRateLimiter, (req, res) => {
    const parseRes = demoLoginRequestSchema.safeParse(req.body);
    if (!parseRes.success) {
      res.status(400).json({
        code: 'INVALID_INPUT',
        message: 'Missing or malformed userId',
        details: parseRes.error.issues,
      });
      return;
    }

    const { userId } = parseRes.data;
    const allowlisted = SEEDED_USERS.find(candidate => candidate.id === userId);
    if (!allowlisted) {
      res.status(404).json({
        code: 'NOT_FOUND',
        message: `Demo user '${userId}' not found or not allowlisted`,
      });
      return;
    }

    let user: UserPublic = allowlisted;
    try {
      const dbUser = new UserRepository(getDb()).getById(userId);
      if (dbUser?.active) {
        user = dbUser;
      }
    } catch (dbErr) {
      console.warn('Database query during session login failed, using allowlisted user:', dbErr);
    }

    const { sessionToken, csrfToken } = createSession(user);
    setSessionCookie(res, sessionToken);

    res.status(201).json({
      user,
      csrfToken,
    });
  });

  // EP-002 GET /api/auth/me
  app.get('/api/auth/me', requireAuth, (_req, res) => {
    const user = res.locals.principal;
    const csrfToken = res.locals.session?.csrfToken;
    res.status(200).json({
      user,
      csrfToken,
    });
  });

  // EP-003 POST /api/auth/logout
  app.post('/api/auth/logout', requireAuth, (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    let sessionToken = cookies[SESSION_COOKIE_NAME];
    if (!sessionToken && req.headers.authorization?.startsWith('Bearer ')) {
      sessionToken = req.headers.authorization.slice(7).trim();
    }
    if (sessionToken) {
      deleteSessionByToken(sessionToken);
    }
    clearSessionCookie(res);
    res.status(201).json({});
  });

  // Demo identities list (for P-002 dropdown in DEMO_MODE)
  app.get('/api/auth/demo-users', requireDemoMode, (_req, res) => {
    res.status(200).json({
      items: SEEDED_USERS,
    });
  });

  // Direct session endpoints for client SPA state lifecycle
  app.get('/api/session', (req, res) => {
    const user = res.locals.principal ?? null;
    const csrfToken = res.locals.session?.csrfToken ?? '';
    res.status(200).json({
      user,
      csrfToken,
      demoMode: config.DEMO_MODE === 'true',
      demoActors: config.DEMO_MODE === 'true' ? SEEDED_USERS.filter(candidate => candidate.active) : [],
    });
  });

  app.post('/api/session', requireDemoMode, loginRateLimiter, (req, res) => {
    const parseRes = demoLoginRequestSchema.safeParse(req.body);
    if (!parseRes.success) {
      res.status(400).json({
        code: 'INVALID_INPUT',
        message: 'Missing or malformed userId',
        details: parseRes.error.issues,
      });
      return;
    }

    const { userId } = parseRes.data;
    const allowlisted = SEEDED_USERS.find(candidate => candidate.id === userId);
    if (!allowlisted) {
      res.status(404).json({
        code: 'NOT_FOUND',
        message: `Demo user '${userId}' not found or not allowlisted`,
      });
      return;
    }

    let user: UserPublic = allowlisted;
    try {
      const dbUser = new UserRepository(getDb()).getById(userId);
      if (dbUser?.active) {
        user = dbUser;
      }
    } catch (dbErr) {
      console.warn('Database query during session login failed, using allowlisted user:', dbErr);
    }

    // Clear any previous session token if switching actor
    const cookies = parseCookies(req.headers.cookie);
    const existingToken = cookies[SESSION_COOKIE_NAME];
    if (existingToken) {
      deleteSessionByToken(existingToken);
    }

    const { sessionToken, csrfToken } = createSession(user);
    setSessionCookie(res, sessionToken);

    res.status(200).json({
      user,
      csrfToken,
    });
  });

  app.delete('/api/session', (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    let sessionToken = cookies[SESSION_COOKIE_NAME];
    if (!sessionToken && req.headers.authorization?.startsWith('Bearer ')) {
      sessionToken = req.headers.authorization.slice(7).trim();
    }
    if (sessionToken) {
      deleteSessionByToken(sessionToken);
    }
    clearSessionCookie(res);
    res.status(200).json({ ok: true });
  });

  // Dedicated unread notification count
  app.get('/api/notifications/unread-count', (req, res) => {
    const principal = res.locals.principal;
    if (!principal) {
      res.json({ count: 0 });
      return;
    }
    const db = getDb();
    const unreadStmt = db.prepare(`
      SELECT COUNT(*) as count FROM notifications
      WHERE recipientId = ? AND readAt IS NULL AND dismissedAt IS NULL
    `);
    const unreadRow = unreadStmt.get(principal.id) as { count: number } | undefined;
    res.json({ count: unreadRow ? unreadRow.count : 0 });
  });

  // EP-004..EP-007: User & Identity Management
  app.get('/api/users', requireRoles('admin'), readRateLimiter, handleGetUsers);
  app.post('/api/users', requireRoles('admin'), writeRateLimiter, handlePostUser);
  app.get('/api/users/:userId', requireAuth, readRateLimiter, handleGetUserById);
  app.patch('/api/users/:userId', requireAuth, writeRateLimiter, handlePatchUserById);

  // EP-019..EP-022: Assignment & Cohort Management
  app.get('/api/assignments', requireRoles('admin', 'student'), readRateLimiter, handleGetAssignments);
  app.post('/api/workflows/:workflowId/assignments', requireRoles('admin'), writeRateLimiter, handlePostWorkflowAssignments);
  app.patch('/api/assignments/:assignmentId', requireRoles('admin'), writeRateLimiter, handlePatchAssignment);
  app.delete('/api/assignments/:assignmentId', requireRoles('admin'), writeRateLimiter, handleDeleteAssignment);

  // EP-023..EP-028: Dynamic Submissions and Deadlines
  app.post('/api/workflows/:workflowId/submissions', requireRoles('student'), writeRateLimiter, handlePostWorkflowSubmissions);
  app.get('/api/submissions', requireAuth, readRateLimiter, handleGetSubmissions);
  app.get('/api/submissions/:submissionId', requireAuth, readRateLimiter, handleGetSubmissionById);
  app.patch('/api/submissions/:submissionId', requireRoles('student'), writeRateLimiter, handlePatchSubmission);
  app.post('/api/submissions/:submissionId/submit', requireRoles('student'), writeRateLimiter, handleSubmitSubmission);
  app.delete('/api/submissions/:submissionId', requireRoles('student'), writeRateLimiter, handleDeleteSubmission);

  // EP-029: Multi-Stage Review Decision (Reviewer only)
  app.post('/api/submissions/:submissionId/decision', requireRoles('reviewer'), writeRateLimiter, handlePostSubmissionDecision);

  // EP-036..EP-039: Private Upload References & File Streaming
  app.post(
    '/api/submissions/:submissionId/attachments',
    requireRoles('student'),
    uploadRateLimiter,
    express.raw({ type: () => true, limit: '6mb' }),
    handlePostAttachment
  );
  app.get('/api/attachments/:attachmentId', requireAuth, readRateLimiter, handleGetAttachment);
  app.patch('/api/attachments/:attachmentId', requireRoles('student'), writeRateLimiter, handlePatchAttachment);
  app.delete('/api/attachments/:attachmentId', requireRoles('student'), writeRateLimiter, handleDeleteAttachment);

  // EP-030..EP-032: Notification Delivery & Management
  app.get('/api/notifications', requireAuth, readRateLimiter, handleGetNotifications);
  app.patch('/api/notifications/:notificationId', requireAuth, writeRateLimiter, handlePatchNotification);
  app.delete('/api/notifications/:notificationId', requireAuth, writeRateLimiter, handleDeleteNotification);

  // EP-034: Workflow Analytics & Live Dashboard (Admin only)
  app.get('/api/workflows/:workflowId/analytics', requireRoles('admin'), readRateLimiter, handleGetWorkflowAnalytics);

  // EP-033: Audit Explorer (Admin only)
  app.get('/api/audit', requireRoles('admin'), readRateLimiter, handleGetAuditLogs);

  // EP-035: Workflow CSV Report Export (Admin only)
  app.get('/api/workflows/:workflowId/report.csv', requireRoles('admin'), readRateLimiter, handleGetWorkflowReportCsv);

  // Route stub for testing student object isolation (IDOR guard)
  app.get('/api/submissions/:submissionId/test-scope', requireAuth, (req, res) => {
    const principal = res.locals.principal!;
    const targetStudentId = req.query.ownerStudentId as string;
    if (principal.role === 'student' && !checkStudentOwnership(principal, targetStudentId)) {
      denyPrivateObject(res);
      return;
    }
    res.status(200).json({ status: 'ok', ownerStudentId: targetStudentId });
  });

  // EP-008..EP-011: Document Management (Admin only)
  app.post('/api/documents', requireRoles('admin'), uploadRateLimiter, express.raw({ type: ['application/pdf', 'text/plain'], limit: '5mb' }), handlePostDocument);
  app.get('/api/documents/:documentId', requireRoles('admin'), handleGetDocument);
  app.patch('/api/documents/:documentId', requireRoles('admin'), handlePatchDocument);
  app.delete('/api/documents/:documentId', requireRoles('admin'), handleDeleteDocument);

  // EP-016: Workflow Proposal Generation (Admin only)
  app.post('/api/workflows/:workflowId/propose', requireRoles('admin'), aiRateLimiter, handleProposeWorkflow);

  // EP-012..EP-018: Workflow Lifecycle & Publish Gate
  app.post('/api/workflows', requireRoles('admin'), writeRateLimiter, handlePostWorkflow);
  app.get('/api/workflows', requireAuth, readRateLimiter, handleGetWorkflows);
  app.get('/api/workflows/:workflowId', requireAuth, readRateLimiter, handleGetWorkflowById);
  app.patch('/api/workflows/:workflowId', requireRoles('admin'), writeRateLimiter, handlePatchWorkflow);
  app.post('/api/workflows/:workflowId/publish', requireRoles('admin'), writeRateLimiter, handlePublishWorkflow);
  app.post('/api/workflows/:workflowId/archive', requireRoles('admin'), writeRateLimiter, handleArchiveWorkflow);

  // Static files and client SPA fallback
  const dirname = path.dirname(fileURLToPath(import.meta.url));
  const staticDir = path.resolve(dirname, '../../dist/client');
  app.use(express.static(staticDir, { maxAge: '1h' }));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(staticDir, 'index.html')));

  // Global JSON error handler
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled server error:', err);
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    const code = (err as { code?: string })?.code || 'INTERNAL_ERROR';
    res.status(500).json({ code, message });
  });

  return app;
}
