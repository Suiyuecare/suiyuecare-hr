-- CreateTable
CREATE TABLE "CompanyTrainingSetting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "onboardingTrainingRequired" BOOLEAN NOT NULL DEFAULT true,
    "targetCompletionDays" INTEGER NOT NULL DEFAULT 7,
    "maxFirstWeekMinutes" INTEGER NOT NULL DEFAULT 10,
    "autoAssignNewHires" BOOLEAN NOT NULL DEFAULT true,
    "verificationStatus" TEXT NOT NULL DEFAULT 'unverified',
    "lastReviewedAt" TIMESTAMP(3),
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyTrainingSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingCourse" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT 'v1',
    "status" TEXT NOT NULL DEFAULT 'active',
    "requiredForOnboarding" BOOLEAN NOT NULL DEFAULT true,
    "estimatedMinutes" INTEGER NOT NULL DEFAULT 5,
    "sourceRef" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeTrainingAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'assigned',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "acknowledgementHash" TEXT,
    "assignedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeTrainingAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyTrainingSetting_companyId_key" ON "CompanyTrainingSetting"("companyId");

-- CreateIndex
CREATE INDEX "CompanyTrainingSetting_tenantId_companyId_idx" ON "CompanyTrainingSetting"("tenantId", "companyId");

-- CreateIndex
CREATE INDEX "CompanyTrainingSetting_tenantId_companyId_verificationStatus_idx" ON "CompanyTrainingSetting"("tenantId", "companyId", "verificationStatus");

-- CreateIndex
CREATE INDEX "TrainingCourse_tenantId_companyId_status_idx" ON "TrainingCourse"("tenantId", "companyId", "status");

-- CreateIndex
CREATE INDEX "TrainingCourse_tenantId_companyId_requiredForOnboarding_idx" ON "TrainingCourse"("tenantId", "companyId", "requiredForOnboarding");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeTrainingAssignment_employeeId_courseId_key" ON "EmployeeTrainingAssignment"("employeeId", "courseId");

-- CreateIndex
CREATE INDEX "EmployeeTrainingAssignment_tenantId_companyId_status_idx" ON "EmployeeTrainingAssignment"("tenantId", "companyId", "status");

-- CreateIndex
CREATE INDEX "EmployeeTrainingAssignment_tenantId_companyId_employeeId_idx" ON "EmployeeTrainingAssignment"("tenantId", "companyId", "employeeId");

-- CreateIndex
CREATE INDEX "EmployeeTrainingAssignment_tenantId_companyId_dueAt_idx" ON "EmployeeTrainingAssignment"("tenantId", "companyId", "dueAt");

-- AddForeignKey
ALTER TABLE "CompanyTrainingSetting" ADD CONSTRAINT "CompanyTrainingSetting_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCourse" ADD CONSTRAINT "TrainingCourse_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeTrainingAssignment" ADD CONSTRAINT "EmployeeTrainingAssignment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeTrainingAssignment" ADD CONSTRAINT "EmployeeTrainingAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeTrainingAssignment" ADD CONSTRAINT "EmployeeTrainingAssignment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
