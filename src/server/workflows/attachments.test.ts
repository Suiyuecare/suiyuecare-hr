import { describe, expect, it } from "vitest";
import {
  flattenFormAttachments,
  normalizeAttachmentMetadata,
  readAttachmentMetadata,
  summarizeAttachmentsForAudit,
  summarizeAttachmentsForDisplay,
} from "./attachments";

describe("workflow attachment metadata", () => {
  it("normalizes safe attachment evidence without requiring raw file bytes", () => {
    expect(normalizeAttachmentMetadata({})).toBeNull();

    expect(
      normalizeAttachmentMetadata({
        fileName: " medical-note.pdf ",
        mimeType: "application/pdf",
        fileSizeBytes: 1234.4,
        storageKey: "hr-one/demo/object",
        scanStatus: "clean",
      }),
    ).toEqual({
      fileName: "medical-note.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 1234,
      storageKey: "hr-one/demo/object",
      scanStatus: "clean",
    });
  });

  it("reads stored json and ignores malformed attachment records", () => {
    expect(
      readAttachmentMetadata([
        { fileName: "proof.pdf", mimeType: "application/pdf", fileSizeBytes: 20, scanStatus: "pending" },
        "not-an-object",
        {},
      ]),
    ).toHaveLength(1);
  });

  it("summarizes attachment evidence for UI and redacted audit metadata", () => {
    const attachment = normalizeAttachmentMetadata({
      fileName: "sensitive-family-care-note.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 50,
      storageKey: "private/object/key",
      scanStatus: "pending",
    });

    expect(attachment).not.toBeNull();
    const attachments = [attachment!];
    expect(summarizeAttachmentsForDisplay(attachments)).toBe("1 attachment reference(s) · 1 pending scan");

    const auditSummary = summarizeAttachmentsForAudit(attachments);
    expect(auditSummary).toMatchObject({
      attachmentCount: 1,
      scanStatuses: ["pending"],
      rawAttachmentMetadataStored: false,
    });
    expect(JSON.stringify(auditSummary)).not.toContain("sensitive-family-care-note.pdf");
    expect(JSON.stringify(auditSummary)).not.toContain("private/object/key");
  });

  it("flattens only file fields from low-code form submissions", () => {
    const attachment = normalizeAttachmentMetadata({ fileName: "receipt.pdf" });
    expect(
      flattenFormAttachments(
        [
          { id: "reason", label: "Reason", type: "text", required: true },
          { id: "proof", label: "Proof", type: "file", required: false },
        ],
        {
          reason: attachment ? [attachment] : [],
          proof: attachment ? [attachment] : [],
        },
      ),
    ).toHaveLength(1);
  });
});
