DO $$
DECLARE
  duplicate_scope_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO duplicate_scope_count
  FROM (
    SELECT 1
    FROM "ReportPermission"
    WHERE "datasetId" IS NOT NULL
      AND "fieldId" IS NULL
    GROUP BY "tenantId", "companyId", "datasetId", "roleKey"
    HAVING COUNT(*) > 1

    UNION ALL

    SELECT 1
    FROM "ReportPermission"
    WHERE "datasetId" IS NOT NULL
      AND "fieldId" IS NOT NULL
    GROUP BY "tenantId", "companyId", "datasetId", "fieldId", "roleKey"
    HAVING COUNT(*) > 1
  ) duplicate_scopes;

  IF duplicate_scope_count > 0 THEN
    RAISE EXCEPTION 'ReportPermission has % duplicate permission scope(s); resolve duplicate tenant/company/dataset/role/field rows before applying unique scope indexes.', duplicate_scope_count;
  END IF;
END $$;

CREATE UNIQUE INDEX "ReportPermission_dataset_scope_unique_idx"
  ON "ReportPermission"("tenantId", "companyId", "datasetId", "roleKey")
  WHERE "datasetId" IS NOT NULL
    AND "fieldId" IS NULL;

CREATE UNIQUE INDEX "ReportPermission_field_scope_unique_idx"
  ON "ReportPermission"("tenantId", "companyId", "datasetId", "fieldId", "roleKey")
  WHERE "datasetId" IS NOT NULL
    AND "fieldId" IS NOT NULL;
