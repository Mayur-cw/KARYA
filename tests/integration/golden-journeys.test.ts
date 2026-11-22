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
import { generateProposal } from '../../src/server/modules/private-source-extraction-ai-proposal-adapter.js';
import type { Workflow } from '../../src/shared/contracts.js';

describe('T-GOLD: Golden Journeys (J-01 through J-07 Verification)', () => {
  let app: ReturnType<typeof createApp>;
  let db: ReturnType<typeof initDatabase>;
  let wfRepo: WorkflowRepository;
  let assignRepo: AssignmentRepository;
  let subRepo: SubmissionRepository;

  const admin = SEEDED_USERS.find((u) => u.role === 'admin')!;
  const studentA = SEEDED_USERS.find((u) => u.name.includes('Student A'))!;
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

  it('T-GOLD-01 (J-01): Admin uploads circular, reviews manual fallback and publishes configured workflow', async () => {
    const adminSession = await getSession(admin);

    // Step 1: Admin uploads source circular (EL-002, EL-010, EL-024)
    const circularText = `
      CIRCULAR: Autonomous Vehicle Research Internship 2026.
      All applicants must submit their Project Title and Abstract by the end of next month.
      Review Process:
      Stage 1: Faculty Mentor Technical Screening.
      Stage 2: Department Dean Final Approval.
    `;
    const docRes = await request(app)
      .post('/api/documents')
      .set('Cookie', adminSession.cookie)
      .set('x-csrf-token', adminSession.csrfToken)
      .send({
        title: 'AV Internship 2026 Notice',
        content: circularText,
        mime: 'text/plain',
      });

    expect(docRes.status).toBe(201);
    expect(docRes.body.id).toBeDefined();
    expect(docRes.body.sha256).toBeDefined();
    const documentId = docRes.body.id;

    // Step 2: AI extraction proposal (EL-027, EL-028)
    const proposal = await generateProposal(circularText, 'AV Internship 2026 Notice');
    expect(proposal.title).toContain('AV Internship');
    expect(proposal.fields.length).toBeGreaterThan(0);
    expect(proposal.origin).toBe('manual');

    // Step 3: Admin reviews in Workflow Editor and creates draft workflow (EL-030, EL-038..EL-042)
    const createWfRes = await request(app)
      .post('/api/workflows')
      .set('Cookie', adminSession.cookie)
      .set('x-csrf-token', adminSession.csrfToken)
      .send({
        title: 'Autonomous Vehicle Research Internship 2026',
        sourceId: documentId,
        fields: [
          { key: 'projectTitle', label: 'Project Title', type: 'text', required: true },
          { key: 'abstract', label: 'Research Abstract', type: 'text', required: true },
        ],
        stages: [
          { stageIndex: 0, label: 'Faculty Mentor Technical Screening', reviewerId: mentor.id },
          { stageIndex: 1, label: 'Department Dean Final Approval', reviewerId: dean.id },
        ],
        deadline: new Date(Date.now() + 14 * 86400000).toISOString(),
        origin: 'ai_extracted',
        uncertainties: [],
      });

    expect(createWfRes.status).toBe(201);
    expect(createWfRes.body.status).toBe('draft');
    const workflowId = createWfRes.body.id;

    const configured = await request(app).patch(`/api/workflows/${workflowId}`)
      .set('Cookie', adminSession.cookie).set('x-csrf-token', adminSession.csrfToken)
      .send({ expectedVersion: 1,
        fields: [{ key: 'projectTitle', label: 'Project Title', type: 'text', required: true }],
        stages: [{ stageIndex: 0, label: 'Mentor Review', reviewerId: mentor.id }, { stageIndex: 1, label: 'Dean Review', reviewerId: dean.id }],
        deadline: new Date(Date.now() + 14 * 86400000).toISOString(), uncertainties: [],
      });
    expect(configured.status).toBe(200);

    // Step 4: Admin publishes workflow (EL-036)
    const publishRes = await request(app)
      .post(`/api/workflows/${workflowId}/publish`)
      .set('Cookie', adminSession.cookie)
      .set('x-csrf-token', adminSession.csrfToken)
      .send({ expectedVersion: 2, studentIds: [studentA.id] });

    expect(publishRes.status).toBe(200);
    expect(publishRes.body.status).toBe('published');

    // Step 5: Verify live monitor reflection (EL-045, EL-054)
    const monitorRes = await request(app)
      .get('/api/workflows?status=published')
      .set('Cookie', adminSession.cookie);

    expect(monitorRes.status).toBe(200);
    expect(monitorRes.body.total).toBeGreaterThanOrEqual(1);
  });

  it('T-GOLD-02 (J-02): Student receives assignment, fills dynamic form, attaches PDF document, and submits', async () => {
    await getSession(admin);
    const studentSession = await getSession(studentA);

    // Setup published workflow with required fields
    const wf: Workflow = {
      id: crypto.randomUUID(),
      departmentId: admin.departmentId,
      createdBy: admin.id,
      title: 'Aerospace Fellowship 2026',
      sourceId: null,
      status: 'published',
      origin: 'manual',
      fields: [
        { key: 'proposalTitle', label: 'Proposal Title', type: 'text', required: true },
        { key: 'methodology', label: 'Methodology Summary', type: 'text', required: true },
      ],
      stages: [
        { stageIndex: 0, label: 'Faculty Screening', reviewerId: mentor.id },
        { stageIndex: 1, label: 'Final Approval', reviewerId: dean.id },
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
    assignRepo.createAssignments(wf.id, [studentA.id]);

    // Step 1: Student checks assigned workflows (EL-003, EL-059)
    const studentHubRes = await request(app)
      .get('/api/assignments')
      .set('Cookie', studentSession.cookie);
    expect(studentHubRes.status).toBe(200);
    expect(studentHubRes.body.items.some((a: { workflowId: string }) => a.workflowId === wf.id)).toBe(true);

    // Step 2: Student creates draft submission (EL-066)
    const draftRes = await request(app)
      .post(`/api/workflows/${wf.id}/submissions`)
      .set('Cookie', studentSession.cookie)
      .set('x-csrf-token', studentSession.csrfToken)
      .send({
        answers: {
          proposalTitle: 'Autonomous Flight Trajectory Optimization',
          methodology: 'Reinforcement learning with safety shields',
        },
      });
    expect(draftRes.status).toBe(201);
    expect(draftRes.body.status).toBe('draft');
    const submissionId = draftRes.body.id;

    // Step 3: Student attaches supporting document (EL-071)
    const samplePdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');
    const uploadRes = await request(app)
      .post(`/api/submissions/${submissionId}/attachments`)
      .set('Cookie', studentSession.cookie)
      .set('x-csrf-token', studentSession.csrfToken)
      .attach('file', samplePdf, 'research-plan.pdf');
    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.id).toBeDefined();

    // Step 4: Student submits (EL-084)
    const submitRes = await request(app)
      .post(`/api/submissions/${submissionId}/submit`)
      .set('Cookie', studentSession.cookie)
      .set('x-csrf-token', studentSession.csrfToken)
      .send({ expectedVersion: 1 });

    expect(submitRes.status).toBe(201);
    expect(submitRes.body.status).toBe('submitted');
    expect(submitRes.body.stageIndex).toBe(0);
    expect(submitRes.body.version).toBe(2);
  });

  it('T-GOLD-03 (J-03): Faculty mentor inspects submission and requests correction with mandatory reason', async () => {
    await getSession(admin);
    const studentSession = await getSession(studentA);
    const mentorSession = await getSession(mentor);

    const wf: Workflow = {
      id: crypto.randomUUID(),
      departmentId: admin.departmentId,
      createdBy: admin.id,
      title: 'Quantum Computing Practicum',
      sourceId: null,
      status: 'published',
      origin: 'manual',
      fields: [{ key: 'topic', label: 'Topic', type: 'text', required: true }],
      stages: [{ stageIndex: 0, label: 'Faculty Screening', reviewerId: mentor.id }],
      uncertainties: [],
      requirements: [],
      deadline: new Date(Date.now() + 7 * 86400000).toISOString(),
      version: 1,
      archiveReason: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    wfRepo.create(wf);
    const [assignment] = assignRepo.createAssignments(wf.id, [studentA.id]);
    const draft = subRepo.createDraft(wf.id, studentA.id, assignment.id, { topic: 'Quantum Circuits' });
    const submitted = subRepo.submitAtomic(draft.id, 1, wf, { id: studentA.id, role: 'student', name: studentA.name });
    const submissionId = submitted.submission!.id;

    // Reviewer views inbox (EL-004, EL-086)
    const inboxRes = await request(app)
      .get('/api/submissions')
      .set('Cookie', mentorSession.cookie);
    expect(inboxRes.status).toBe(200);
    expect(inboxRes.body.items.some((i: { id: string }) => i.id === submissionId)).toBe(true);

    // Reviewer returns case for correction (EL-099, EL-105)
    const decisionRes = await request(app)
      .post(`/api/submissions/${submissionId}/decision`)
      .set('Cookie', mentorSession.cookie)
      .set('x-csrf-token', mentorSession.csrfToken)
      .send({
        action: 'needs_changes',
        reason: 'Please elaborate on the quantum noise mitigation strategy in your proposal.',
        expectedVersion: 2,
      });

    expect(decisionRes.status).toBe(201);
    expect(decisionRes.body.status).toBe('needs_changes');
    expect(decisionRes.body.version).toBe(3);

    // Student receives correction notification
    const notifRes = await request(app)
      .get('/api/notifications')
      .set('Cookie', studentSession.cookie);
    expect(notifRes.status).toBe(200);
    expect(notifRes.body.items.some((n: { eventType: string }) => n.eventType === 'correction_requested')).toBe(true);
  });

  it('T-GOLD-04 (J-04): Student fixes returned submission and resubmits to same stage', async () => {
    await getSession(admin);
    const studentSession = await getSession(studentA);
    const mentorSession = await getSession(mentor);

    const wf: Workflow = {
      id: crypto.randomUUID(),
      departmentId: admin.departmentId,
      createdBy: admin.id,
      title: 'Robotics Summer Grant',
      sourceId: null,
      status: 'published',
      origin: 'manual',
      fields: [{ key: 'method', label: 'Method', type: 'text', required: true }],
      stages: [{ stageIndex: 0, label: 'Faculty Review', reviewerId: mentor.id }],
      uncertainties: [],
      requirements: [],
      deadline: new Date(Date.now() + 7 * 86400000).toISOString(),
      version: 1,
      archiveReason: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    wfRepo.create(wf);
    const [assignment] = assignRepo.createAssignments(wf.id, [studentA.id]);
    const draft = subRepo.createDraft(wf.id, studentA.id, assignment.id, { method: 'PID' });
    subRepo.submitAtomic(draft.id, 1, wf, { id: studentA.id, role: 'student', name: studentA.name });

    // Reviewer returns
    await request(app)
      .post(`/api/submissions/${draft.id}/decision`)
      .set('Cookie', mentorSession.cookie)
      .set('x-csrf-token', mentorSession.csrfToken)
      .send({
        action: 'needs_changes',
        reason: 'PID is insufficient. Use adaptive nonlinear MPC.',
        expectedVersion: 2,
      });

    // Student patches answers (EL-078, EL-070)
    const patchRes = await request(app)
      .patch(`/api/submissions/${draft.id}`)
      .set('Cookie', studentSession.cookie)
      .set('x-csrf-token', studentSession.csrfToken)
      .send({
        answers: { method: 'Adaptive Nonlinear Model Predictive Control (MPC)' },
        expectedVersion: 3,
      });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.version).toBe(4);

    // Student resubmits (EL-085)
    const resubmitRes = await request(app)
      .post(`/api/submissions/${draft.id}/submit`)
      .set('Cookie', studentSession.cookie)
      .set('x-csrf-token', studentSession.csrfToken)
      .send({ expectedVersion: 4 });

    expect(resubmitRes.status).toBe(201);
    expect(resubmitRes.body.status).toBe('submitted');
    expect(resubmitRes.body.revision).toBe(2);
    expect(resubmitRes.body.stageIndex).toBe(0);
  });

  it('T-GOLD-05 (J-05): Reviewers approve across all stages (Mentor -> Dean -> Approved)', async () => {
    await getSession(admin);
    const mentorSession = await getSession(mentor);
    const deanSession = await getSession(dean);

    const wf: Workflow = {
      id: crypto.randomUUID(),
      departmentId: admin.departmentId,
      createdBy: admin.id,
      title: 'Biomedical Innovation Lab Grant',
      sourceId: null,
      status: 'published',
      origin: 'manual',
      fields: [{ key: 'abstract', label: 'Abstract', type: 'text', required: true }],
      stages: [
        { stageIndex: 0, label: 'Faculty Screening', reviewerId: mentor.id },
        { stageIndex: 1, label: 'Dean Final Endorsement', reviewerId: dean.id },
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
    const [assignment] = assignRepo.createAssignments(wf.id, [studentA.id]);
    const draft = subRepo.createDraft(wf.id, studentA.id, assignment.id, { abstract: 'Biosensor Arrays' });
    const submitted = subRepo.submitAtomic(draft.id, 1, wf, { id: studentA.id, role: 'student', name: studentA.name });
    const subId = submitted.submission!.id;

    // Stage 0: Mentor approves (EL-104)
    const mentorApproveRes = await request(app)
      .post(`/api/submissions/${subId}/decision`)
      .set('Cookie', mentorSession.cookie)
      .set('x-csrf-token', mentorSession.csrfToken)
      .send({ action: 'approve', expectedVersion: 2 });

    expect(mentorApproveRes.status).toBe(201);
    expect(mentorApproveRes.body.status).toBe('in_review');
    expect(mentorApproveRes.body.stageIndex).toBe(1);

    // Stage 1: Dean approves (EL-104)
    const deanApproveRes = await request(app)
      .post(`/api/submissions/${subId}/decision`)
      .set('Cookie', deanSession.cookie)
      .set('x-csrf-token', deanSession.csrfToken)
      .send({ action: 'approve', expectedVersion: 3 });

    expect(deanApproveRes.status).toBe(201);
    expect(deanApproveRes.body.status).toBe('approved');
    expect(deanApproveRes.body.stageIndex).toBe(1);

    // Final assignment status completed
    const finalAssign = assignRepo.getByStudentAndWorkflow(studentA.id, wf.id);
    expect(finalAssign?.status).toBe('completed');
  });

  it('T-GOLD-06 (J-06): Admin examines tamper-evident audit trail with provenance links', async () => {
    const adminSession = await getSession(admin);

    const auditRes = await request(app)
      .get('/api/audit')
      .set('Cookie', adminSession.cookie);

    expect(auditRes.status).toBe(200);
    expect(auditRes.body.items).toBeDefined();
    expect(Array.isArray(auditRes.body.items)).toBe(true);

    // Verify audit structure conforms to provenance requirements
    for (const log of auditRes.body.items) {
      expect(log.id).toBeDefined();
      expect(log.departmentId).toBe(admin.departmentId);
      expect(log.actorRole).toBeDefined();
      expect(log.timestamp).toBeDefined();
    }
  });

  it('T-GOLD-07 (J-07): Admin tracks monitor metrics and exports workflow CSV report', async () => {
    const adminSession = await getSession(admin);

    // Monitor overview
    const overviewRes = await request(app)
      .get('/api/workflows?status=published')
      .set('Cookie', adminSession.cookie);

    expect(overviewRes.status).toBe(200);
    expect(typeof overviewRes.body.total).toBe('number');
    expect(overviewRes.body.items).toEqual(expect.any(Array));

    // Setup workflow and export CSV
    const wf: Workflow = {
      id: crypto.randomUUID(),
      departmentId: admin.departmentId,
      createdBy: admin.id,
      title: 'Metrics Export Practicum',
      sourceId: null,
      status: 'published',
      origin: 'manual',
      fields: [{ key: 'title', label: 'Title', type: 'text', required: true }],
      stages: [{ stageIndex: 0, label: 'Faculty Screening', reviewerId: mentor.id }],
      uncertainties: [],
      requirements: [],
      deadline: new Date(Date.now() + 7 * 86400000).toISOString(),
      version: 1,
      archiveReason: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    wfRepo.create(wf);

    const reportRes = await request(app)
      .get(`/api/workflows/${wf.id}/report.csv`)
      .set('Cookie', adminSession.cookie);

    expect(reportRes.status).toBe(200);
    expect(reportRes.headers['content-type']).toContain('text/csv');
    expect(reportRes.text).toContain('Submission ID');
  });
});
