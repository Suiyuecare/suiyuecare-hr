ALTER TABLE "CompanyFileStorageSetting" ADD COLUMN "verificationStatus" TEXT NOT NULL DEFAULT 'unverified';
ALTER TABLE "CompanyFileStorageSetting" ADD COLUMN "lastVerifiedAt" TIMESTAMP(3);
ALTER TABLE "CompanyFileStorageSetting" ADD COLUMN "verificationNote" TEXT;
