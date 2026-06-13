-- Store safe attachment evidence references for workflow requests.
-- Raw file bytes remain in object storage; audit logs store only hashes/counts.
ALTER TABLE "LeaveRequest" ADD COLUMN "attachmentMetadataJson" JSONB;
ALTER TABLE "FormSubmission" ADD COLUMN "attachmentMetadataJson" JSONB;
