import { beforeEach, describe, expect, it } from "vitest";
import {
  createDemoFormTemplate,
  decideDemoApproval,
  getDemoManagerInbox,
  resetDemoWorkflowState,
  submitDemoCustomForm,
  submitDemoLeave,
} from "./demo-store";
import {
  getProductTelemetryDemoEvents,
  resetProductTelemetryDemoState,
} from "@/server/telemetry/product";

describe("workflow KPI telemetry", () => {
  beforeEach(() => {
    resetDemoWorkflowState();
    resetProductTelemetryDemoState();
  });

  it("records privacy-safe employee and manager workflow events", () => {
    const beforeCount = getProductTelemetryDemoEvents().length;

    submitDemoLeave({
      startAt: new Date(),
      endAt: new Date(),
      units: 1,
      reason: "Private family reason should not be stored in telemetry",
    });

    const managerInbox = getDemoManagerInbox("manager", "demo-manager-employee");
    decideDemoApproval({
      requestId: managerInbox.pending[0].id,
      action: "approve",
      comment: "Private approval comment should not be stored in telemetry",
    });

    const added = getProductTelemetryDemoEvents().slice(beforeCount);
    expect(added.map((event) => event.eventName)).toEqual([
      "leave_request_success",
      "mobile_task_started",
      "mobile_task_completed",
      "manager_approval_done",
    ]);
    expect(JSON.stringify(added)).not.toContain("Private family reason");
    expect(JSON.stringify(added)).not.toContain("Private approval comment");
  });

  it("records HR self-service form builder and employee form submission telemetry", () => {
    const beforeCount = getProductTelemetryDemoEvents().length;
    const template = createDemoFormTemplate({
      title: "Badge request",
      description: "Request a badge.",
      category: "Employee service",
      fields: [{ id: "reason", label: "Reason", type: "text", required: true }],
      workflowStepTypes: ["direct_manager"],
    });

    submitDemoCustomForm({
      templateId: template.id,
      values: { reason: "Lost" },
    });

    const added = getProductTelemetryDemoEvents().slice(beforeCount);
    expect(added).toEqual(expect.arrayContaining([
      expect.objectContaining({
        eventName: "form_template_created",
        metadata: expect.objectContaining({ engineeringSupport: false }),
      }),
      expect.objectContaining({
        eventName: "mobile_task_completed",
        metadata: expect.objectContaining({ taskType: "custom_form" }),
      }),
    ]));
  });
});
