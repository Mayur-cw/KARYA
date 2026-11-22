import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initDatabase, getDb, WorkflowRepository, SubmissionRepository } from '../../src/server/repository';
import { seedPresentation, PRESENTATION_WORKFLOWS, samplePresentationPdf } from '../../src/server/presentation-seed';
import { SEEDED_USERS } from '../../src/server/session';

describe('Presentation data is usable and repeatable', () => {
  let directory: string;
  beforeEach(() => { directory = mkdtempSync(path.join(os.tmpdir(), 'karya-demo-')); vi.stubEnv('ATTACHMENT_STORAGE_DIR', directory); initDatabase(':memory:'); });
  afterEach(() => { getDb().close(); vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });
  it('does not add presentation records unless demo access is explicitly enabled', () => {
    seedPresentation(getDb(), { DEMO_MODE: 'false', DEMO_SEED: 'true' });
    expect(new WorkflowRepository(getDb()).listByDepartment(SEEDED_USERS[0]!.departmentId)).toHaveLength(0);
  });
  it('creates all scenarios, real private evidence, and notifications exactly once', () => {
    const db = getDb(); const env = { ...process.env, DEMO_MODE: 'true', DEMO_SEED: 'true' };
    seedPresentation(db, env);
    const workflows = new WorkflowRepository(db);
    const submissions = new SubmissionRepository(db);
    expect(workflows.listByDepartment(SEEDED_USERS[0]!.departmentId)).toHaveLength(6);
    expect(submissions.getByStudentAndWorkflow(SEEDED_USERS[1]!.id, PRESENTATION_WORKFLOWS[1].id)?.status).toBe('needs_changes');
    expect(submissions.getByStudentAndWorkflow(SEEDED_USERS[2]!.id, PRESENTATION_WORKFLOWS[2].id)?.stageIndex).toBe(1);
    expect(submissions.getByStudentAndWorkflow(SEEDED_USERS[1]!.id, PRESENTATION_WORKFLOWS[3].id)?.status).toBe('approved');
    const attachment = db.prepare('SELECT privateStorageKey, bytes, status FROM attachments LIMIT 1').get() as { privateStorageKey: string; bytes: number; status: string };
    const file = readFileSync(path.join(directory, attachment.privateStorageKey));
    expect(file.length).toBe(attachment.bytes);
    expect(file.subarray(0, 8).toString()).toContain('%PDF');
    const before = db.prepare('SELECT COUNT(*) count FROM notifications').get() as { count: number };
    const draft = workflows.getLatestVersion(PRESENTATION_WORKFLOWS[4].id)!;
    draft.title = 'Administrator edited this sample'; workflows.updateVersioned(draft, draft.version);
    seedPresentation(db, env);
    expect(workflows.getLatestVersion(draft.id)?.title).toBe('Administrator edited this sample');
    expect((db.prepare('SELECT COUNT(*) count FROM notifications').get() as { count: number }).count).toBe(before.count);
  });
  it('generates sample PDFs with correct cross-reference offsets', () => {
    const pdf = samplePresentationPdf('Demo Student', 'Sample review');
    const text = pdf.toString(); const xref = Number(text.match(/startxref\n(\d+)/)?.[1]);
    expect(text.slice(xref, xref + 4)).toBe('xref');
    expect(text).toContain('Not an official institutional document');
  });
});
