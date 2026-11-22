import { describe, it, expect } from 'vitest';
import {
  roleSchema,
  userSchema,
  workflowDraftCreateSchema,
  workflowEditablePatchSchema,
  reviewDecisionCommandSchema,
  sanitizeCsvField,
  isValidSubmissionTransition,
  attachmentSchema,
  workflowFieldSchema,
} from '../../src/shared/contracts';

describe('Contracts & Schemas (T-02)', () => {
  describe('Role & Error schemas', () => {
    it('accepts valid roles and rejects unauthorized roles', () => {
      expect(roleSchema.safeParse('admin').success).toBe(true);
      expect(roleSchema.safeParse('student').success).toBe(true);
      expect(roleSchema.safeParse('reviewer').success).toBe(true);
      expect(roleSchema.safeParse('anonymous').success).toBe(true);
      expect(roleSchema.safeParse('superadmin').success).toBe(false);
      expect(roleSchema.safeParse('').success).toBe(false);
    });
  });

  describe('Workflow validation (VR-003, VR-007, VR-008)', () => {
    it('validates user schema correctly', () => {
      const validUser = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        departmentId: '123e4567-e89b-12d3-a456-426614174001',
        name: 'Prof. Sharma',
        email: 'sharma@college.edu',
        role: 'reviewer',
        active: true,
        createdAt: '2026-11-22T10:00:00Z',
      };
      expect(userSchema.safeParse(validUser).success).toBe(true);
    });

    it('validates workflow editable patch schema', () => {
      expect(workflowEditablePatchSchema.safeParse({
        title: 'Updated Internship Title',
        expectedVersion: 1,
      }).success).toBe(true);
    });
    it('enforces title boundaries between 5 and 120 characters', () => {
      expect(workflowDraftCreateSchema.safeParse({ title: 'Four' }).success).toBe(false);
      expect(workflowDraftCreateSchema.safeParse({ title: 'Valid Workflow Title' }).success).toBe(true);
      expect(workflowDraftCreateSchema.safeParse({ title: 'A'.repeat(121) }).success).toBe(false);
    });

    it('validates field keys and types', () => {
      expect(workflowFieldSchema.safeParse({
        key: 'student_name',
        label: 'Student Name',
        type: 'text',
        required: true,
      }).success).toBe(true);

      // Invalid key with spaces or special characters
      expect(workflowFieldSchema.safeParse({
        key: 'student name',
        label: 'Student Name',
        type: 'text',
        required: true,
      }).success).toBe(false);

      // Invalid field type
      expect(workflowFieldSchema.safeParse({
        key: 'field_1',
        label: 'Field 1',
        type: 'audio',
        required: true,
      }).success).toBe(false);
    });
  });

  describe('Review decision validations (VR-013, VR-014)', () => {
    it('allows approval without reason', () => {
      const res = reviewDecisionCommandSchema.safeParse({
        action: 'approve',
        expectedVersion: 1,
      });
      expect(res.success).toBe(true);
    });

    it('rejects needs_changes without reason or with reason < 10 chars', () => {
      const noReason = reviewDecisionCommandSchema.safeParse({
        action: 'needs_changes',
        expectedVersion: 1,
      });
      expect(noReason.success).toBe(false);

      const shortReason = reviewDecisionCommandSchema.safeParse({
        action: 'needs_changes',
        reason: 'Too short',
        expectedVersion: 1,
      });
      expect(shortReason.success).toBe(false);

      const validReason = reviewDecisionCommandSchema.safeParse({
        action: 'needs_changes',
        reason: 'Please upload the correct offer letter signed by HR.',
        expectedVersion: 1,
      });
      expect(validReason.success).toBe(true);
    });

    it('rejects rejection without adequate reason', () => {
      const noReason = reviewDecisionCommandSchema.safeParse({
        action: 'reject',
        expectedVersion: 1,
      });
      expect(noReason.success).toBe(false);

      const validReason = reviewDecisionCommandSchema.safeParse({
        action: 'reject',
        reason: 'Company is not on the accredited internship provider list.',
        expectedVersion: 1,
      });
      expect(validReason.success).toBe(true);
    });
  });

  describe('State transitions & security guards (VR-012)', () => {
    it('validates submission state transitions accurately', () => {
      // draft -> submitted: valid
      expect(isValidSubmissionTransition('draft', 'submitted', 0, 2)).toBe(true);
      // needs_changes -> submitted: valid
      expect(isValidSubmissionTransition('needs_changes', 'submitted', 0, 2)).toBe(true);

      // stage 0 of 2: submitted -> in_review (advances to stage 1): valid
      expect(isValidSubmissionTransition('submitted', 'in_review', 0, 2)).toBe(true);
      // stage 0 of 2: submitted -> approved directly: invalid
      expect(isValidSubmissionTransition('submitted', 'approved', 0, 2)).toBe(false);

      // stage 1 of 2: in_review -> approved (final stage): valid
      expect(isValidSubmissionTransition('in_review', 'approved', 1, 2)).toBe(true);

      // reviewer can always request correction or reject
      expect(isValidSubmissionTransition('submitted', 'needs_changes', 0, 2)).toBe(true);
      expect(isValidSubmissionTransition('submitted', 'rejected', 0, 2)).toBe(true);
      expect(isValidSubmissionTransition('in_review', 'needs_changes', 1, 2)).toBe(true);
      expect(isValidSubmissionTransition('in_review', 'rejected', 1, 2)).toBe(true);

      // terminal states cannot transition back
      expect(isValidSubmissionTransition('approved', 'submitted', 1, 2)).toBe(false);
      expect(isValidSubmissionTransition('rejected', 'submitted', 1, 2)).toBe(false);
    });
  });

  describe('CSV formula injection neutralization (VR-019)', () => {
    it('neutralizes spreadsheet formula indicators', () => {
      expect(sanitizeCsvField('=1+1')).toBe("'=1+1");
      expect(sanitizeCsvField('+cmd')).toBe("'+cmd");
      expect(sanitizeCsvField('-500')).toBe("'-500");
      expect(sanitizeCsvField('@SUM(A1:A10)')).toBe("'@SUM(A1:A10)");
      expect(sanitizeCsvField('Plain text student')).toBe('Plain text student');
      expect(sanitizeCsvField(null)).toBe('');
    });
  });

  describe('Attachment boundaries (VR-015)', () => {
    it('enforces 5 MiB file size boundary', () => {
      const valid = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        submissionId: '123e4567-e89b-12d3-a456-426614174001',
        uploadedBy: '123e4567-e89b-12d3-a456-426614174002',
        displayName: 'offer_letter.pdf',
        mime: 'application/pdf',
        bytes: 1024 * 1024,
        sha256: 'a'.repeat(64),
        privateStorageKey: 'key_123',
        status: 'draft',
        createdAt: '2026-11-22T12:00:00Z',
      };
      expect(attachmentSchema.safeParse(valid).success).toBe(true);

      // Over 5 MiB (5242881 bytes)
      const oversize = { ...valid, bytes: 5242881 };
      expect(attachmentSchema.safeParse(oversize).success).toBe(false);
    });
  });
});
