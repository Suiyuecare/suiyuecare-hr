import { describe, expect, it, beforeEach } from "vitest";
import {
  createDemoFormTemplate,
  decideDemoApproval,
  getDemoEmployeeWorkspace,
  getDemoManagerInbox,
  resetDemoWorkflowState,
  submitDemoCustomForm,
} from "./demo-store";

describe("custom form workflow", () => {
  beforeEach(() => {
    resetDemoWorkflowState();
  });

  it("routes custom forms through manager and HR approval steps", () => {
    const template = createDemoFormTemplate({
      title: "Badge replacement",
      description: "Request a replacement badge.",
      category: "Employee service",
      fields: [{ id: "reason", label: "Reason", type: "text", required: true }],
      workflowStepTypes: ["direct_manager", "hr_admin"],
    });

    submitDemoCustomForm({
      templateId: template.id,
      values: { reason: "Lost badge" },
    });

    const managerInbox = getDemoManagerInbox("manager", "demo-manager-employee");
    expect(managerInbox.pending).toHaveLength(1);
    expect(managerInbox.pending[0].type).toBe("custom_form");
    expect(managerInbox.pending[0].currentStepLabel).toBe("Manager review");

    decideDemoApproval({
      requestId: managerInbox.pending[0].id,
      action: "approve",
      comment: "Looks fine",
    });

    const hrInbox = getDemoManagerInbox("hr_admin", "demo-hr-employee");
    expect(hrInbox.pending).toHaveLength(1);
    expect(hrInbox.pending[0].currentStepLabel).toBe("HR review");

    decideDemoApproval({
      requestId: hrInbox.pending[0].id,
      action: "approve",
      comment: "Issued",
    });

    const employeeWorkspace = getDemoEmployeeWorkspace();
    expect(employeeWorkspace.requests[0]).toMatchObject({
      title: "Badge replacement",
      status: "approved",
    });
    expect(employeeWorkspace.notifications[0].body).toContain("林人資");
  });
});
