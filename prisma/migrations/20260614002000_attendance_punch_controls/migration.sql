ALTER TABLE "AttendancePolicy"
  ADD COLUMN "allowRemotePunch" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "requireOfficeNetworkPunch" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "allowedOfficeIpCidrsJson" JSONB,
  ADD COLUMN "requireGpsProximityPunch" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "officeLatitude" DECIMAL(10, 7),
  ADD COLUMN "officeLongitude" DECIMAL(10, 7),
  ADD COLUMN "gpsRadiusMeters" INTEGER NOT NULL DEFAULT 300,
  ADD COLUMN "punchPolicyNote" TEXT;
