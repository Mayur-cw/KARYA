import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/server/app.js';
import { clearAllSessions, SEEDED_USERS } from '../../src/server/session.js';
import {
  initDatabase,
  WorkflowRepository,
  AssignmentRepository,
  SubmissionRepository,
} from '../../src/server/repository.js';
import { createNotification } from '../../src/server/events.js';
import type { Workflow } from '../../src/shared/contracts.js';

describe('T-11 — Notification Delivery and Live Dashboards', () => {
  let app: ReturnType<typeof createApp>;
  let db: ReturnType<typeof initDatabase>;
  let wfRepo: WorkflowRepository;
  let assignRepo: AssignmentRepository;
  let subRepo: SubmissionRepository;

  const admin = SEEDED_USERS.find((u) => u.role === 'admin')!;
  const studentA = SEEDED_USERS.find((u) => u.name.includes('Student A'))!;
  const studentB = SEEDED_USERS.find((u) => u.name.includes('Student B'))!;
  const mentor = SEEDED_USERS.find((u) => u.name.includes('Mentor'))!;
  const dean = SEEDED_USERS.find((u) => u.name.includes('Dean'))!;

  beforeEach(() => {
    clearAllSessions();
    db = initDatabase(':memory:');
    wfRepo = new WorkflowRepository(db);
    assignRepo = new AssignmentRepository(db);
    subRepo = new SubmissionRepository(db);
    app = createApp();
  });

  async function getSession(user: typeof admin) {
    const loginRes = await request(app).post('/api/auth/demo-login').send({ userId: user.id });
    return {
      cookie: loginRes.headers['set-cookie'][0],
      csrfToken: loginRes.body.csrfToken,
    };
  }

  function createWorkflowWithStages(): Workflow {
    const wf: Workflow = {
      id: crypto.randomUUID(),
      departmentId: admin.departmentId,
      createdBy: admin.id,
      title: 'Autonomous Robotics Grant 2026',
      sourceId: null,
      status: 'published',
      origin: 'manual',
      fields: [{ key: 'milestone', label: 'Milestone', type: 'text', required: true }],
      stages: [
        { stageIndex: 0, label: 'Technical Screening', reviewerId: mentor.id },
        { stageIndex: 1, label: 'Dean Approval', reviewerId: dean.id },
      ],
      uncertainties: [],
      requirements: [],
      deadline: new Date(Date.now() + 14 * 86400000).toISOString(),
      version: 1,
      archiveReason: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    wfRepo.create(wf);
    return wf;
  }

  describe('T-API-030: GET /api/notifications', () => {
    it('returns recipient-only alerts, unread filter, and accurate unread count', async () => {
      const studentASession = await getSession(studentA);
      const studentBSession = await getSession(studentB);

      // Seed 2 notifications for Student A (1 unread, 1 read)
      const notif1 = createNotification(db, {
        recipientId: studentA.id,
        eventType: 'assignment_created',
        title: 'New Workflow Assigned',
        body: 'You have been invited to apply for Autonomous Robotics Grant.',
        targetRef: '/student/workflows/wf-1',
      });

      const notif2 = createNotification(db, {
        recipientId: studentA.id,
        eventType: 'submission_approved',
        title: 'Application Approved',
        body: 'Your milestone report has been approved.',
        targetRef: '/student/submissions/sub-1',
      });
      // Mark notif2 as read
      db.prepare("UPDATE notifications SET readAt = ? WHERE id = ?").run(
        new Date().toISOString(),
        notif2.id
      );

      // Seed 1 notification for Student B
      createNotification(db, {
        recipientId: studentB.id,
        eventType: 'correction_requested',
        title: 'Correction Needed',
        body: 'Please revise section 3.',
        targetRef: '/student/submissions/sub-2',
      });

      // Student A sees only their 2 notifications
      const listRes = await request(app)
        .get('/api/notifications')
        .set('Cookie', studentASession.cookie);

      expect(listRes.status).toBe(200);
      expect(listRes.body.total).toBe(2);
      expect(listRes.body.unreadCount).toBe(1);
      expect(listRes.body.items.some((i: { id: string }) => i.id === notif1.id)).toBe(true);
      expect(listRes.body.items.some((i: { id: string }) => i.id === notif2.id)).toBe(true);

      // Filter unread=true returns only notif1
      const unreadRes = await request(app)
        .get('/api/notifications?unread=true')
        .set('Cookie', studentASession.cookie);

      expect(unreadRes.status).toBe(200);
      expect(unreadRes.body.total).toBe(1);
      expect(unreadRes.body.items[0].id).toBe(notif1.id);

      // Student B sees only their 1 notification
      const bRes = await request(app)
        .get('/api/notifications')
        .set('Cookie', studentBSession.cookie);

      expect(bRes.status).toBe(200);
      expect(bRes.body.total).toBe(1);
      expect(bRes.body.items[0].recipientId).toBe(studentB.id);
    });
  });

  describe('T-API-031: PATCH /api/notifications/:notificationId', () => {
    it('allows recipient to mark notification read; prevents cross-user tampering', async () => {
      const studentASession = await getSession(studentA);
      const studentBSession = await getSession(studentB);

      const notif = createNotification(db, {
        recipientId: studentA.id,
        eventType: 'general_announcement',
        title: 'Notice',
        body: 'Please check your dashboard.',
      });

      // Student B cannot mark Student A notification
      const bRes = await request(app)
        .patch(`/api/notifications/${notif.id}`)
        .set('Cookie', studentBSession.cookie)
        .set('x-csrf-token', studentBSession.csrfToken)
        .send({ action: 'read' });
      expect(bRes.status).toBe(403);

      // Student A marks as read
      const markRes = await request(app)
        .patch(`/api/notifications/${notif.id}`)
        .set('Cookie', studentASession.cookie)
        .set('x-csrf-token', studentASession.csrfToken)
        .send({ action: 'read' });

      expect(markRes.status).toBe(200);
      expect(markRes.body.id).toBe(notif.id);
      expect(markRes.body.readAt).toBeDefined();

      // Verify unread count is now 0
      const listRes = await request(app)
        .get('/api/notifications')
        .set('Cookie', studentASession.cookie);
      expect(listRes.body.unreadCount).toBe(0);
    });
  });

  describe('T-API-032: DELETE /api/notifications/:notificationId', () => {
    it('soft-dismisses notification and excludes it from future inbox lists', async () => {
      const studentASession = await getSession(studentA);
      const studentBSession = await getSession(studentB);

      const notif = createNotification(db, {
        recipientId: studentA.id,
        eventType: 'alert',
        title: 'Dismissable Alert',
        body: 'Alert message.',
      });

      // Student B cannot dismiss Student A notification
      const bRes = await request(app)
        .delete(`/api/notifications/${notif.id}`)
        .set('Cookie', studentBSession.cookie)
        .set('x-csrf-token', studentBSession.csrfToken);
      expect(bRes.status).toBe(403);

      // Student A dismisses notification
      const delRes = await request(app)
        .delete(`/api/notifications/${notif.id}`)
        .set('Cookie', studentASession.cookie)
        .set('x-csrf-token', studentASession.csrfToken);

      expect(delRes.status).toBe(200);
      expect(delRes.body.deleted).toBe(true);

      // Invariant: Dismissed notification no longer appears in inbox
      const listRes = await request(app)
        .get('/api/notifications')
        .set('Cookie', studentASession.cookie);
      expect(listRes.body.total).toBe(0);
    });
  });

  describe('T-API-034: GET /api/workflows/:workflowId/analytics', () => {
    it('computes live coherent metrics and stage breakdowns directly from database', async () => {
      const adminSession = await getSession(admin);
      const studentSession = await getSession(studentA);
      const wf = createWorkflowWithStages();

      // Assign student A and student B
      const [assignA, assignB] = assignRepo.createAssignments(wf.id, [studentA.id, studentB.id]);

      // Student A creates draft, submits, and is reviewed
      const subA = subRepo.createDraft(wf.id, studentA.id, assignA.id, { milestone: 'Alpha' });
      subRepo.submitAtomic(subA.id, 1, wf, { id: studentA.id, role: 'student', name: studentA.name });

      // Student B creates draft (not yet submitted)
      subRepo.createDraft(wf.id, studentB.id, assignB.id, { milestone: 'Beta' });

      // Non-admin roles (student) get 403 Forbidden
      const studentRes = await request(app)
        .get(`/api/workflows/${wf.id}/analytics`)
        .set('Cookie', studentSession.cookie);
      expect(studentRes.status).toBe(403);

      // Admin accesses live analytics
      const analyticsRes = await request(app)
        .get(`/api/workflows/${wf.id}/analytics`)
        .set('Cookie', adminSession.cookie);

      expect(analyticsRes.status).toBe(200);
      expect(analyticsRes.body.workflowId).toBe(wf.id);
      expect(analyticsRes.body.totalAssigned).toBe(2);
      expect(analyticsRes.body.started).toBe(2); // Both created draft
      expect(analyticsRes.body.draft).toBe(1); // Student B is draft
      expect(analyticsRes.body.submitted).toBe(1); // Student A is submitted
      expect(analyticsRes.body.stageBreakdown.length).toBe(2);
      expect(analyticsRes.body.stageBreakdown[0].stageIndex).toBe(0);
      expect(analyticsRes.body.stageBreakdown[0].reviewerName).toBe(mentor.name);
      expect(analyticsRes.body.stageBreakdown[0].pendingCount).toBe(1); // Student A pending at stage 0
      expect(analyticsRes.body.stageBreakdown[1].stageIndex).toBe(1);
      expect(analyticsRes.body.stageBreakdown[1].reviewerName).toBe(dean.name);
      expect(analyticsRes.body.stageBreakdown[1].pendingCount).toBe(0);
    });
  });
});
