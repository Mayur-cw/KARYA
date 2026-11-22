import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import {
  MemoryRepository,
  initDatabase,
  UserRepository,
  WorkflowRepository,
  SubmissionRepository,
  NotificationRepository,
  AuditRepository,
  AnalyticsRepository,
} from '../../src/server/repository.js';
import { SEEDED_DEPARTMENT_ID, SEEDED_USERS } from '../../src/server/session.js';
import type { Workflow } from '../../src/shared/contracts.js';

describe('Repository & SQLite Persistence (T-04)', () => {
  it('stores and retrieves unique records in MemoryRepository', async () => {
    const r = new MemoryRepository<{ id: string; value: string }>();
    await r.save({ id: 'one', value: 'first' });
    expect(await r.get('one')).toEqual({ id: 'one', value: 'first' });
    expect(await r.get('missing')).toBeNull();
  });

  describe('SQLite Database & Domain Repositories', () => {
    let db: DatabaseSync;
    let userRepo: UserRepository;
    let wfRepo: WorkflowRepository;
    let subRepo: SubmissionRepository;
    let notifRepo: NotificationRepository;
    let auditRepo: AuditRepository;
    let analyticsRepo: AnalyticsRepository;

    const admin = SEEDED_USERS.find((u) => u.role === 'admin')!;
    const studentA = SEEDED_USERS.find((u) => u.name.includes('Student A'))!;
    const mentor = SEEDED_USERS.find((u) => u.name.includes('Mentor'))!;
    const finalAuth = SEEDED_USERS.find((u) => u.name.includes('Final Authority'))!;

    beforeEach(() => {
      // Use in-memory SQLite database for clean test isolation
      db = initDatabase(':memory:');
      userRepo = new UserRepository(db);
      wfRepo = new WorkflowRepository(db);
      subRepo = new SubmissionRepository(db);
      notifRepo = new NotificationRepository(db);
      auditRepo = new AuditRepository(db);
      analyticsRepo = new AnalyticsRepository(db);
    });

    it('seeds and retrieves the 5 demo users with correct roles and department', () => {
      const users = userRepo.listByDepartment(SEEDED_DEPARTMENT_ID);
      expect(users.length).toBe(5);

      const foundAdmin = userRepo.getById(admin.id);
      expect(foundAdmin).toBeDefined();
      expect(foundAdmin?.role).toBe('admin');

      const foundStudent = userRepo.getById(studentA.id);
      expect(foundStudent?.role).toBe('student');
    });

    it('enforces optimistic concurrency on workflow updates (rejects stale version)', () => {
      const wf: Workflow = {
        id: '123e4567-e89b-12d3-a456-426614174111',
        departmentId: SEEDED_DEPARTMENT_ID,
        createdBy: admin.id,
        title: 'Summer Internship Approval 2026',
        sourceId: null,
        status: 'draft',
        origin: 'manual',
        fields: [{ key: 'company_name', label: 'Company Name', type: 'text', required: true }],
        stages: [
          { stageIndex: 0, label: 'Faculty Mentor Review', reviewerId: mentor.id },
          { stageIndex: 1, label: 'Dean Final Approval', reviewerId: finalAuth.id },
        ],
        uncertainties: [],
        deadline: new Date(Date.now() + 86400000).toISOString(),
        version: 1,
        createdAt: new Date().toISOString(),
      };
      wfRepo.create(wf);

      // Stale update attempt (expecting version 2 when current is 1)
      const staleRes = wfRepo.updateVersioned({ ...wf, title: 'Conflicting Edit' }, 2);
      expect(staleRes).toBe(false);

      // Valid update (expecting version 1 -> advances to 2)
      const validRes = wfRepo.updateVersioned({ ...wf, title: 'Updated Internship Approval' }, 1);
      expect(validRes).toBe(true);

      const latest = wfRepo.getLatestVersion(wf.id);
      expect(latest?.version).toBe(2);
      expect(latest?.title).toBe('Updated Internship Approval');
    });

    it('executes atomic workflow publication: validates prerequisites, assigns students, notifies recipients, logs audit', () => {
      const futureDeadline = new Date(Date.now() + 7 * 86400000).toISOString();
      const wf: Workflow = {
        id: '123e4567-e89b-12d3-a456-426614174222',
        departmentId: SEEDED_DEPARTMENT_ID,
        createdBy: admin.id,
        title: 'Autonomous Systems Internship Workflow',
        status: 'proposed',
        origin: 'manual',
        fields: [{ key: 'offer_letter', label: 'Offer Letter', type: 'file', required: true }],
        stages: [
          { stageIndex: 0, label: 'Stage 1 Mentor', reviewerId: mentor.id },
          { stageIndex: 1, label: 'Stage 2 Authority', reviewerId: finalAuth.id },
        ],
        uncertainties: [],
        deadline: futureDeadline,
        version: 1,
        createdAt: new Date().toISOString(),
      };
      wfRepo.create(wf);

      // Publish atomically
      const pubRes = wfRepo.publishAtomic(wf.id, 1, [studentA.id], {
        id: admin.id,
        role: admin.role,
        departmentId: admin.departmentId,
      });

      expect(pubRes.success).toBe(true);
      expect(pubRes.workflow?.status).toBe('published');
      expect(pubRes.workflow?.version).toBe(2);

      // Verify notification created for student
      const notifs = notifRepo.listByRecipient(studentA.id);
      expect(notifs.length).toBe(1);
      expect(notifs[0].title).toContain('New Process Assigned');

      // Verify audit logged
      const audits = auditRepo.list({ departmentId: SEEDED_DEPARTMENT_ID, workflowId: wf.id });
      expect(audits.some((a) => a.event === 'published')).toBe(true);
    });

    it('blocks publication if uncertainties remain unresolved or deadline missing', () => {
      const wf: Workflow = {
        id: '123e4567-e89b-12d3-a456-426614174333',
        departmentId: SEEDED_DEPARTMENT_ID,
        createdBy: admin.id,
        title: 'Ambiguous Circular Workflow',
        status: 'proposed',
        origin: 'ai',
        fields: [{ key: 'report', label: 'Report', type: 'text', required: true }],
        stages: [{ stageIndex: 0, label: 'Mentor', reviewerId: mentor.id }],
        uncertainties: [
          {
            id: 'unc-1',
            kind: 'deadline',
            description: 'Submission deadline not specified in circular',
            resolved: false,
          },
        ],
        deadline: null,
        version: 1,
        createdAt: new Date().toISOString(),
      };
      wfRepo.create(wf);

      const res = wfRepo.publishAtomic(wf.id, 1, [studentA.id], {
        id: admin.id,
        role: admin.role,
        departmentId: admin.departmentId,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('deadline is required');
    });

    it('orchestrates complete flagship multi-stage review journey atomically', () => {
      // 1. Setup published workflow with 2 stages
      const wf: Workflow = {
        id: '123e4567-e89b-12d3-a456-426614174444',
        departmentId: SEEDED_DEPARTMENT_ID,
        createdBy: admin.id,
        title: 'Flagship Verification Workflow',
        status: 'published',
        origin: 'manual',
        fields: [{ key: 'company', label: 'Company', type: 'text', required: true }],
        stages: [
          { stageIndex: 0, label: 'Faculty Mentor', reviewerId: mentor.id },
          { stageIndex: 1, label: 'Dean Final Authority', reviewerId: finalAuth.id },
        ],
        uncertainties: [],
        deadline: new Date(Date.now() + 86400000).toISOString(),
        version: 2,
        createdAt: new Date().toISOString(),
      };
      wfRepo.create(wf);

      // 2. Student A creates draft
      const assignId = '123e4567-e89b-12d3-a456-426614174999';
      db.prepare(`
        INSERT INTO assignments (id, workflowId, studentId, status, assignedAt)
        VALUES (?, ?, ?, 'invited', ?)
      `).run(assignId, wf.id, studentA.id, new Date().toISOString());

      const draft = subRepo.createDraft(wf.id, studentA.id, assignId, { company: 'Google' });
      expect(draft.status).toBe('draft');
      expect(draft.version).toBe(1);

      // 3. Student A submits
      const submitRes1 = subRepo.submitAtomic(draft.id, 1, wf, {
        id: studentA.id,
        role: 'student',
        name: studentA.name,
      });
      expect(submitRes1.success).toBe(true);
      expect(submitRes1.submission?.status).toBe('submitted');
      expect(submitRes1.submission?.version).toBe(2);

      // Mentor received notification
      const mentorNotifs1 = notifRepo.listByRecipient(mentor.id);
      expect(mentorNotifs1.length).toBeGreaterThan(0);

      // 4. Mentor requests correction with feedback
      const returnRes = subRepo.recordDecisionAtomic(
        draft.id,
        'needs_changes',
        'Please provide official company email domain for confirmation.',
        2,
        wf,
        { id: mentor.id, role: 'reviewer', name: mentor.name }
      );
      expect(returnRes.success).toBe(true);
      expect(returnRes.submission?.status).toBe('needs_changes');
      expect(returnRes.submission?.version).toBe(3);

      // Student receives correction notification
      const studentNotifs = notifRepo.listByRecipient(studentA.id);
      expect(studentNotifs.some((n) => n.title.includes('Correction Requested'))).toBe(true);

      // 5. Student revises answers and resubmits
      subRepo.updateAnswers(draft.id, { company: 'Google', domain: 'google.com' }, 3);
      const resubmitRes = subRepo.submitAtomic(draft.id, 4, wf, {
        id: studentA.id,
        role: 'student',
        name: studentA.name,
      });
      expect(resubmitRes.success).toBe(true);
      expect(resubmitRes.submission?.status).toBe('submitted');
      expect(resubmitRes.submission?.revision).toBe(2);

      // 6. Mentor approves (Stage 0 -> Stage 1)
      const mentorApprove = subRepo.recordDecisionAtomic(
        draft.id,
        'approve',
        undefined,
        5,
        wf,
        { id: mentor.id, role: 'reviewer', name: mentor.name }
      );
      expect(mentorApprove.success).toBe(true);
      expect(mentorApprove.submission?.status).toBe('in_review');
      expect(mentorApprove.submission?.stageIndex).toBe(1);

      // Final authority notified
      const finalNotifs = notifRepo.listByRecipient(finalAuth.id);
      expect(finalNotifs.some((n) => n.title.includes('Pending Stage Review'))).toBe(true);

      // 7. Final authority approves
      const finalApprove = subRepo.recordDecisionAtomic(
        draft.id,
        'approve',
        undefined,
        6,
        wf,
        { id: finalAuth.id, role: 'reviewer', name: finalAuth.name }
      );
      expect(finalApprove.success).toBe(true);
      expect(finalApprove.submission?.status).toBe('approved');
      expect(finalApprove.submission?.history.length).toBe(3); // return + mentor approve + final approve

      // 8. Analytics reflects accurate real counts
      const analytics = analyticsRepo.getWorkflowAnalytics(wf.id);
      expect(analytics.approved).toBe(1);
      expect(analytics.submitted).toBe(0);
      expect(analytics.inReview).toBe(0);
    });

    it('persists data across database reopening (app restart test)', () => {
      // Create temporary file db
      const tempPath = `/tmp/karya_test_${Date.now()}.db`;
      const fileDb1 = initDatabase(tempPath);
      const fileWfRepo1 = new WorkflowRepository(fileDb1);

      const testWf: Workflow = {
        id: 'restart-wf-1',
        departmentId: SEEDED_DEPARTMENT_ID,
        createdBy: admin.id,
        title: 'Restart Persistence Proof',
        status: 'draft',
        origin: 'manual',
        fields: [{ key: 'f1', label: 'F1', type: 'text', required: true }],
        stages: [{ stageIndex: 0, label: 'S1', reviewerId: mentor.id }],
        uncertainties: [],
        deadline: null,
        version: 1,
        createdAt: new Date().toISOString(),
      };
      fileWfRepo1.create(testWf);

      // Close and reopen database
      fileDb1.close();

      const fileDb2 = new DatabaseSync(tempPath);
      const fileWfRepo2 = new WorkflowRepository(fileDb2);
      const reloaded = fileWfRepo2.getLatestVersion('restart-wf-1');

      expect(reloaded).toBeDefined();
      expect(reloaded?.title).toBe('Restart Persistence Proof');
      expect(reloaded?.fields[0].key).toBe('f1');
      fileDb2.close();
    });
  });
});
