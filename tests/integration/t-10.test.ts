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
import type { Workflow } from '../../src/shared/contracts.js';

describe('T-10 — Private Upload References and File Streaming', () => {
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

  function setupSubmission() {
    const wf: Workflow = {
      id: crypto.randomUUID(),
      departmentId: admin.departmentId,
      createdBy: admin.id,
      title: 'Aerospace Engineering Practicum',
      sourceId: null,
      status: 'published',
      origin: 'manual',
      fields: [{ key: 'coverLetter', label: 'Cover Letter', type: 'text', required: true }],
      stages: [
        { stageIndex: 0, label: 'Mentor Review', reviewerId: mentor.id },
        { stageIndex: 1, label: 'Dean Endorsement', reviewerId: dean.id },
      ],
      uncertainties: [],
      requirements: [],
      deadline: new Date(Date.now() + 7 * 86400000).toISOString(),
      version: 1,
      archiveReason: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    wfRepo.create(wf);
    const [assignment] = assignRepo.createAssignments(wf.id, [studentA.id, studentB.id]);
    const submission = subRepo.createDraft(wf.id, studentA.id, assignment.id, {
      coverLetter: 'Attached documents for aerodynamics project.',
    });
    return { wf, assignment, submission };
  }

  // Create valid sample PDF buffer with magic bytes %PDF-1.4
  const samplePdfBuffer = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF'
  );

  // Sample fake executable / HTML
  const evilScriptBuffer = Buffer.from('<script>alert("xss")</script>');

  describe('T-API-036: POST /api/submissions/:submissionId/attachments', () => {
    it('uploads valid PDF attachment with magic byte verification, bounds check, and role scoping', async () => {
      const studentASession = await getSession(studentA);
      const studentBSession = await getSession(studentB);
      const adminSession = await getSession(admin);
      const { submission } = setupSubmission();

      // Admin role cannot upload student attachment (403)
      const adminRes = await request(app)
        .post(`/api/submissions/${submission.id}/attachments`)
        .set('Cookie', adminSession.cookie)
        .set('x-csrf-token', adminSession.csrfToken)
        .send({ fileName: 'file.pdf', content: samplePdfBuffer.toString('base64') });
      expect(adminRes.status).toBe(403);

      // Student B (non-owner) cannot attach to Student A's submission (403)
      const bRes = await request(app)
        .post(`/api/submissions/${submission.id}/attachments`)
        .set('Cookie', studentBSession.cookie)
        .set('x-csrf-token', studentBSession.csrfToken)
        .send({ fileName: 'file.pdf', content: samplePdfBuffer.toString('base64') });
      expect(bRes.status).toBe(403);

      // Disguised script or non-PDF/PNG/JPEG fails magic byte check (415)
      const invalidTypeRes = await request(app)
        .post(`/api/submissions/${submission.id}/attachments`)
        .set('Cookie', studentASession.cookie)
        .set('x-csrf-token', studentASession.csrfToken)
        .send({ fileName: 'exploit.pdf', content: evilScriptBuffer.toString('base64') });
      expect(invalidTypeRes.status).toBe(415);
      expect(invalidTypeRes.body.code).toBe('UNSUPPORTED_MEDIA_TYPE');

      // Valid upload by Student A succeeds
      const uploadRes = await request(app)
        .post(`/api/submissions/${submission.id}/attachments`)
        .set('Cookie', studentASession.cookie)
        .set('x-csrf-token', studentASession.csrfToken)
        .send({ fileName: 'Recommendation_Letter.pdf', content: samplePdfBuffer.toString('base64') });

      expect(uploadRes.status).toBe(201);
      expect(uploadRes.body.submissionId).toBe(submission.id);
      expect(uploadRes.body.displayName).toBe('Recommendation_Letter.pdf');
      expect(uploadRes.body.mime).toBe('application/pdf');
      expect(uploadRes.body.bytes).toBe(samplePdfBuffer.length);
      expect(uploadRes.body.status).toBe('draft');
      expect(uploadRes.body.id).toBeDefined();

      // Max 3 attachments enforcement (VR-015)
      await request(app)
        .post(`/api/submissions/${submission.id}/attachments`)
        .set('Cookie', studentASession.cookie)
        .set('x-csrf-token', studentASession.csrfToken)
        .send({ fileName: 'transcript.pdf', content: samplePdfBuffer.toString('base64') });

      await request(app)
        .post(`/api/submissions/${submission.id}/attachments`)
        .set('Cookie', studentASession.cookie)
        .set('x-csrf-token', studentASession.csrfToken)
        .send({ fileName: 'resume.pdf', content: samplePdfBuffer.toString('base64') });

      // 4th attachment rejected
      const fourthRes = await request(app)
        .post(`/api/submissions/${submission.id}/attachments`)
        .set('Cookie', studentASession.cookie)
        .set('x-csrf-token', studentASession.csrfToken)
        .send({ fileName: 'extra.pdf', content: samplePdfBuffer.toString('base64') });
      expect(fourthRes.status).toBe(422);
      expect(fourthRes.body.code).toBe('LIMIT_EXCEEDED');
    });
  });

  describe('T-API-037: GET /api/attachments/:attachmentId', () => {
    it('streams attachment with secure headers and strictly prevents IDOR cross-student access', async () => {
      const studentASession = await getSession(studentA);
      const studentBSession = await getSession(studentB);
      const mentorSession = await getSession(mentor);
      const adminSession = await getSession(admin);
      const { submission } = setupSubmission();

      // Student A uploads attachment
      const uploadRes = await request(app)
        .post(`/api/submissions/${submission.id}/attachments`)
        .set('Cookie', studentASession.cookie)
        .set('x-csrf-token', studentASession.csrfToken)
        .send({ fileName: 'Aarav_CV.pdf', content: samplePdfBuffer.toString('base64') });
      const attachmentId = uploadRes.body.id;

      // Student A (owner) can download
      const downloadARes = await request(app)
        .get(`/api/attachments/${attachmentId}`)
        .set('Cookie', studentASession.cookie);

      expect(downloadARes.status).toBe(200);
      expect(downloadARes.headers['content-type']).toBe('application/pdf');
      expect(downloadARes.headers['content-disposition']).toContain('Aarav_CV.pdf');
      expect(downloadARes.headers['x-content-type-options']).toBe('nosniff');
      expect(downloadARes.body).toEqual(samplePdfBuffer);

      // Student B blocked (403 Forbidden IDOR Guard)
      const downloadBRes = await request(app)
        .get(`/api/attachments/${attachmentId}`)
        .set('Cookie', studentBSession.cookie);
      expect(downloadBRes.status).toBe(403);
      expect(downloadBRes.body.code).toBe('FORBIDDEN');

      // Reviewer (assigned to stage 0) can download
      const downloadMentorRes = await request(app)
        .get(`/api/attachments/${attachmentId}`)
        .set('Cookie', mentorSession.cookie);
      expect(downloadMentorRes.status).toBe(200);

      // Admin in department can download
      const downloadAdminRes = await request(app)
        .get(`/api/attachments/${attachmentId}`)
        .set('Cookie', adminSession.cookie);
      expect(downloadAdminRes.status).toBe(200);
    });
  });

  describe('T-API-038: PATCH /api/attachments/:attachmentId', () => {
    it('allows student to rename draft attachment and sanitizes dangerous path traversal', async () => {
      const studentASession = await getSession(studentA);
      const studentBSession = await getSession(studentB);
      const { submission } = setupSubmission();

      const uploadRes = await request(app)
        .post(`/api/submissions/${submission.id}/attachments`)
        .set('Cookie', studentASession.cookie)
        .set('x-csrf-token', studentASession.csrfToken)
        .send({ fileName: 'initial_doc.pdf', content: samplePdfBuffer.toString('base64') });
      const attachmentId = uploadRes.body.id;

      // Student B cannot rename Student A's attachment
      const bRes = await request(app)
        .patch(`/api/attachments/${attachmentId}`)
        .set('Cookie', studentBSession.cookie)
        .set('x-csrf-token', studentBSession.csrfToken)
        .send({ displayName: 'Hacked_Name.pdf' });
      expect(bRes.status).toBe(403);

      // Student A renames draft attachment with path traversal attack
      const patchRes = await request(app)
        .patch(`/api/attachments/${attachmentId}`)
        .set('Cookie', studentASession.cookie)
        .set('x-csrf-token', studentASession.csrfToken)
        .send({ displayName: '../../../etc/passwd.pdf' });

      expect(patchRes.status).toBe(200);
      // Path traversal stripped; safe basename stored
      expect(patchRes.body.displayName).toBe('passwd.pdf');
    });
  });

  describe('T-API-039: DELETE /api/attachments/:attachmentId', () => {
    it('allows deletion of draft attachment; strictly blocks deletion of locked submitted evidence', async () => {
      const studentASession = await getSession(studentA);
      const studentBSession = await getSession(studentB);
      const { wf, submission } = setupSubmission();

      const uploadRes = await request(app)
        .post(`/api/submissions/${submission.id}/attachments`)
        .set('Cookie', studentASession.cookie)
        .set('x-csrf-token', studentASession.csrfToken)
        .send({ fileName: 'file_to_delete.pdf', content: samplePdfBuffer.toString('base64') });
      const attachmentId = uploadRes.body.id;

      // Student B cannot delete Student A's attachment
      const bRes = await request(app)
        .delete(`/api/attachments/${attachmentId}`)
        .set('Cookie', studentBSession.cookie)
        .set('x-csrf-token', studentBSession.csrfToken);
      expect(bRes.status).toBe(403);

      // Student submits submission -> lock attachments!
      subRepo.submitAtomic(submission.id, 1, wf, {
        id: studentA.id,
        role: 'student',
        name: studentA.name,
      });

      // Attempting to delete locked attachment fails with 409 Conflict
      const lockedDeleteRes = await request(app)
        .delete(`/api/attachments/${attachmentId}`)
        .set('Cookie', studentASession.cookie)
        .set('x-csrf-token', studentASession.csrfToken);

      expect(lockedDeleteRes.status).toBe(409);
      expect(lockedDeleteRes.body.code).toBe('ILLEGAL_STATE');
      expect(lockedDeleteRes.body.message).toContain('locked');

      // Now create a submission for Student B with draft attachment to test clean deletion
      const studentBAssign = assignRepo.getByStudentAndWorkflow(studentB.id, wf.id)!;
      const sub2 = subRepo.createDraft(wf.id, studentB.id, studentBAssign.id, { coverLetter: 'Draft 2' });
      const upload2Res = await request(app)
        .post(`/api/submissions/${sub2.id}/attachments`)
        .set('Cookie', studentBSession.cookie)
        .set('x-csrf-token', studentBSession.csrfToken)
        .send({ fileName: 'draft_file.pdf', content: samplePdfBuffer.toString('base64') });
      const att2Id = upload2Res.body.id;

      const deleteRes = await request(app)
        .delete(`/api/attachments/${att2Id}`)
        .set('Cookie', studentBSession.cookie)
        .set('x-csrf-token', studentBSession.csrfToken);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.deleted).toBe(true);

      // Attachment no longer accessible
      const getRes = await request(app)
        .get(`/api/attachments/${att2Id}`)
        .set('Cookie', studentBSession.cookie);
      expect(getRes.status).toBe(404);
    });
  });
});
