import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { Workflow, Submission, UserPublic } from '../shared/contracts.js';
import { AssignmentRepository, AttachmentRepository, SourceDocumentRepository, SubmissionRepository, WorkflowRepository } from './repository.js';
import { attachmentDirectory } from './storage.js';
import { recordAudit, createNotification } from './events.js';
import { SEEDED_USERS, SEEDED_DEPARTMENT_ID } from './session.js';

export function isPresentationEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.DEMO_MODE === 'true' && (env.DEMO_SEED === 'true' || (env.DEMO_SEED !== 'false' && env.NODE_ENV !== 'test'));
}

type Scenario = 'draft' | 'submitted' | 'needs_changes' | 'in_review' | 'approved';
export const PRESENTATION_WORKFLOWS = [
  { id: 'a1000000-0000-4000-8000-000000000001', title: 'Summer Research Internship', kind: 'published', scenarios: { b: 'draft' } },
  { id: 'a1000000-0000-4000-8000-000000000002', title: 'Conference Travel Grant', kind: 'published', scenarios: { a: 'needs_changes' } },
  { id: 'a1000000-0000-4000-8000-000000000003', title: 'Research Ethics Approval', kind: 'published', scenarios: { a: 'submitted', b: 'in_review' } },
  { id: 'a1000000-0000-4000-8000-000000000004', title: 'Student Innovation Fund', kind: 'published', scenarios: { a: 'approved', b: 'submitted' } },
  { id: 'a1000000-0000-4000-8000-000000000005', title: 'Advanced Lab Access', kind: 'draft', scenarios: {} },
  { id: 'a1000000-0000-4000-8000-000000000006', title: 'Campus Research Showcase', kind: 'archived', scenarios: { a: 'approved' } },
] as const;

// A valid, deliberately labelled sample PDF. Private evidence is created locally;
// sample records never reference nonexistent files or official institutional documents.
export function samplePresentationPdf(student: string, workflow: string): Buffer {
  const escape = (value: string) => value.replace(/[^\x20-\x7e]/g, '').replace(/[\\()]/g, '\\$&');
  const lines = ['KARYA | PRESENTATION SAMPLE', 'Not an official institutional document', '', `Applicant: ${student}`, `Process: ${workflow}`, '', 'Sample supporting statement for the presentation.', 'This document demonstrates private evidence access.', 'All names and application details belong to demo accounts.'];
  const content = `BT /F1 15 Tf 50 760 Td 23 TL ${lines.map((line, index) => `${index ? 'T* ' : ''}(${escape(line)}) Tj`).join('\n')} ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

export function seedPresentation(db: DatabaseSync, env: NodeJS.ProcessEnv = process.env): void {
  if (!isPresentationEnabled(env)) return;
  const [admin, studentA, studentB, mentor, dean] = SEEDED_USERS;
  if (!admin || !studentA || !studentB || !mentor || !dean) throw new Error('Presentation identities are not configured');
  const workflows = new WorkflowRepository(db);
  const assignments = new AssignmentRepository(db);
  const submissions = new SubmissionRepository(db);
  const documents = new SourceDocumentRepository(db);
  const attachments = new AttachmentRepository(db);
  const storage = env.ATTACHMENT_STORAGE_DIR || attachmentDirectory();
  const now = new Date();
  const future = (days: number) => new Date(now.getTime() + days * 86400000).toISOString();
  const actor = { id: admin.id, role: admin.role, actorId: admin.id, actorRole: admin.role, departmentId: SEEDED_DEPARTMENT_ID };

  const requireSubmission = (result: { success: boolean; error?: string; submission?: Submission }): Submission => {
    if (!result.success || !result.submission) throw new Error(`Presentation setup failed: ${result.error || 'Submission unavailable'}`);
    return result.submission;
  };
  const prepareApplication = (workflow: Workflow, student: UserPublic, scenario: Scenario) => {
    const assignment = assignments.getByStudentAndWorkflow(student.id, workflow.id);
    if (!assignment) throw new Error('Presentation assignment unavailable');
    const created = submissions.createDraft(workflow.id, student.id, assignment.id, {
      project_title: `${student.id === studentA.id ? 'Responsible computing' : 'Sustainable campus'} research proposal`,
      organization: 'Sample University Research Centre',
      purpose: 'A presentation application demonstrating requirements, feedback, evidence, and sequential review.',
      start_date: future(7).slice(0, 10),
    });
    recordAudit(db, { ...actor, workflowId: workflow.id, actorId: student.id, actorRole: 'student', event: 'submission_draft_created', targetEntity: 'Submission', targetId: created.id, details: { presentationSample: true } });
    fs.mkdirSync(storage, { recursive: true });
    const file = samplePresentationPdf(student.name, workflow.title);
    const attachmentId = crypto.randomUUID();
    const storageKey = `${crypto.randomUUID()}.pdf`;
    fs.writeFileSync(path.join(storage, storageKey), file, { flag: 'wx' });
    attachments.create({ id: attachmentId, submissionId: created.id, uploadedBy: student.id, displayName: 'Presentation supporting statement.pdf', mime: 'application/pdf', bytes: file.length, sha256: crypto.createHash('sha256').update(file).digest('hex'), privateStorageKey: storageKey, status: 'draft', createdAt: now.toISOString() });
    recordAudit(db, { ...actor, workflowId: workflow.id, actorId: student.id, actorRole: 'student', event: 'attachment_uploaded', targetEntity: 'Attachment', targetId: attachmentId, details: { presentationSample: true, submissionId: created.id } });
    let current = submissions.updateAnswers(created.id, { ...created.answers, supporting_statement: attachmentId }, created.version);
    if (!current) throw new Error('Unable to save presentation answers');
    if (scenario === 'draft') return;
    current = requireSubmission(submissions.submitAtomic(current.id, current.version, workflow, student));
    if (scenario === 'submitted') return;
    if (scenario === 'needs_changes') {
      requireSubmission(submissions.recordDecisionAtomic(current.id, 'needs_changes', 'Please add the conference agenda and clarify how your session supports the research project.', current.version, workflow, mentor));
      return;
    }
    current = requireSubmission(submissions.recordDecisionAtomic(current.id, 'approve', 'Sample application checked and forwarded for final review.', current.version, workflow, mentor));
    if (scenario === 'approved') requireSubmission(submissions.recordDecisionAtomic(current.id, 'approve', 'Sample application meets all presentation requirements.', current.version, workflow, dean));
  };

  for (const [index, fixture] of PRESENTATION_WORKFLOWS.entries()) {
    // Fixed fixture IDs make restarts additive and preserve edits and review decisions.
    if (workflows.getLatestVersion(fixture.id)) continue;
    const sourceId = crypto.randomUUID();
    const deadline = future(14 + index * 3);
    const text = `PRESENTATION SAMPLE — ${fixture.title}\nThis fictional circular is provided only for the KARYA demonstration.\nApplicants provide a project title, organization, purpose, start date, and supporting statement.\nA faculty mentor reviews the application before the final authority.\nInitial applications close on ${deadline}.\nRequested corrections may be resubmitted after the initial deadline.`;
    documents.create({ id: sourceId, departmentId: SEEDED_DEPARTMENT_ID, ownerId: admin.id, title: `Presentation sample: ${fixture.title}`, mime: 'text/plain', sha256: crypto.createHash('sha256').update(text).digest('hex'), extractedText: text, pageOffsets: [{ page: 1, startOffset: 0, endOffset: text.length }], status: 'referenced', createdAt: now.toISOString() });
    const draft: Workflow = {
      id: fixture.id, departmentId: SEEDED_DEPARTMENT_ID, createdBy: admin.id, title: `${fixture.title} · Demo`, sourceId,
      status: 'draft', origin: 'manual', version: 1, createdAt: now.toISOString(), updatedAt: now.toISOString(),
      deadline: fixture.kind === 'draft' ? null : deadline,
      fields: [
        { key: 'project_title', label: 'Project title', type: 'text', required: true },
        { key: 'organization', label: 'Organization or department', type: 'text', required: true },
        { key: 'purpose', label: 'Purpose of this application', type: 'text', required: true },
        { key: 'start_date', label: 'Expected start date', type: 'date', required: true },
        { key: 'supporting_statement', label: 'Supporting statement', type: 'file', required: true },
      ],
      stages: [{ stageIndex: 0, label: 'Faculty mentor review', reviewerId: mentor.id }, { stageIndex: 1, label: 'Final authority approval', reviewerId: fixture.kind === 'draft' ? '' : dean.id }],
      uncertainties: fixture.kind === 'draft' ? [{ id: 'demo-access-confirmation', kind: 'requirement', description: 'Confirm lab safety induction requirements and the final reviewer before publishing this sample.', resolved: false }] : [],
      requirements: [{ id: `demo-requirement-${index}`, text: 'Provide the application details and a supporting statement for sequential faculty and final review.', sourcePassage: 'Applicants provide a project title, organization, purpose, start date, and supporting statement.', uncertain: false }],
    };
    workflows.create(draft);
    recordAudit(db, { ...actor, workflowId: draft.id, event: 'workflow_created', targetEntity: 'Workflow', targetId: draft.id, details: { presentationSample: true } });
    if (fixture.kind === 'draft') continue;
    const publication = workflows.publishAtomic(draft.id, draft.version, [studentA.id, studentB.id], actor);
    if (!publication.success || !publication.workflow) throw new Error(`Presentation publication failed: ${publication.error}`);
    for (const [key, scenario] of Object.entries(fixture.scenarios)) prepareApplication(publication.workflow, key === 'a' ? studentA : studentB, scenario as Scenario);
    if (fixture.kind === 'archived' && !workflows.archive(draft.id, 'Presentation sample: previous showcase application period completed.', publication.workflow.version, actor)) throw new Error('Unable to archive sample workflow');
  }
  const marker = db.prepare("SELECT id FROM audit_logs WHERE event = 'presentation_seeded' LIMIT 1").get();
  if (!marker) {
    recordAudit(db, { ...actor, event: 'presentation_seeded', targetEntity: 'Presentation', targetId: 'karya-presentation-v1', details: { presentationSample: true, workflowCount: PRESENTATION_WORKFLOWS.length } });
    createNotification(db, { recipientId: admin.id, eventType: 'presentation_ready', title: 'Your presentation workspace is ready', body: 'Sample processes cover new applications, drafts, corrections, both review stages, approvals, and a publication blocker.', targetRef: '/admin' });
  }
}
