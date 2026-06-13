import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import {
  assignRequiredTraining,
  completeTrainingAssignment,
  saveTrainingCourse,
  updateTrainingSettings,
  type TrainingCourseStatus,
  type TrainingVerificationStatus,
} from "@/server/training/compliance";

export async function POST(request: Request) {
  const formData = await request.formData();
  const intent = readString(formData.get("intent"));

  try {
    if (intent === "settings") {
      await updateTrainingSettings(await requireTenantSession({ permission: "training:manage" }), {
        onboardingTrainingRequired: formData.get("onboardingTrainingRequired") === "on",
        targetCompletionDays: readNumber(formData.get("targetCompletionDays")),
        maxFirstWeekMinutes: readNumber(formData.get("maxFirstWeekMinutes")),
        autoAssignNewHires: formData.get("autoAssignNewHires") === "on",
        verificationStatus: readString(formData.get("verificationStatus")) as TrainingVerificationStatus,
      });
      return NextResponse.redirect(new URL("/hr/training", request.url), 303);
    }

    if (intent === "course") {
      await saveTrainingCourse(await requireTenantSession({ permission: "training:manage" }), {
        id: readString(formData.get("courseId")) || undefined,
        title: readString(formData.get("title")),
        category: readString(formData.get("category")),
        description: readString(formData.get("description")),
        version: readString(formData.get("version")),
        status: readString(formData.get("status")) as TrainingCourseStatus,
        requiredForOnboarding: formData.get("requiredForOnboarding") === "on",
        estimatedMinutes: readNumber(formData.get("estimatedMinutes")),
        sourceRef: readString(formData.get("sourceRef")) || undefined,
      });
      return NextResponse.redirect(new URL("/hr/training", request.url), 303);
    }

    if (intent === "assign_required") {
      await assignRequiredTraining(await requireTenantSession({ permission: "training:manage" }));
      return NextResponse.redirect(new URL("/hr/training", request.url), 303);
    }

    if (intent === "complete") {
      await completeTrainingAssignment(
        await requireTenantSession({ permission: "training:self", employeeRequired: true }),
        readString(formData.get("assignmentId")),
      );
      return NextResponse.redirect(new URL("/app/training", request.url), 303);
    }

    throw new Error("Unknown training action.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update training.";
    const target = intent === "complete" ? "/app/training" : "/hr/training";
    return NextResponse.redirect(new URL(`${target}?error=${encodeURIComponent(message)}`, request.url), 303);
  }
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: FormDataEntryValue | null) {
  const number = Number(readString(value));
  return Number.isFinite(number) ? number : undefined;
}
