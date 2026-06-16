export type PilotEvidenceScanInputFile = {
  path: string;
  content: string;
};

export type PilotEvidenceScanFinding = {
  path: string;
  category: PilotEvidenceSensitiveCategory;
  count: number;
};

export type PilotEvidenceScanReport = {
  status: "pass" | "failed";
  scannedFileCount: number;
  findingCount: number;
  categories: Array<{
    category: PilotEvidenceSensitiveCategory;
    count: number;
  }>;
  findings: PilotEvidenceScanFinding[];
};

export type PilotEvidenceSensitiveCategory =
  | "database_url"
  | "bearer_token"
  | "supabase_secret_key"
  | "private_key"
  | "raw_database_env"
  | "taiwan_national_id_label"
  | "bank_account_label"
  | "salary_amount_label"
  | "health_data_label";

const sensitivePatterns: Array<{
  category: PilotEvidenceSensitiveCategory;
  pattern: RegExp;
}> = [
  {
    category: "database_url",
    pattern: /postgres(?:ql)?:\/\/[^\s"'`<>]+/gi,
  },
  {
    category: "bearer_token",
    pattern: /Bearer\s+[A-Za-z0-9._-]{12,}/g,
  },
  {
    category: "supabase_secret_key",
    pattern: /\bsb_secret_[A-Za-z0-9_-]+/g,
  },
  {
    category: "private_key",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  },
  {
    category: "raw_database_env",
    pattern: /\bDATABASE_URL\s*=\s*[^\s]+/g,
  },
  {
    category: "taiwan_national_id_label",
    pattern: /(身分證字號|身分證|統一證號|居留證號|national id|id number)\s*[:：=]\s*\S+/gi,
  },
  {
    category: "bank_account_label",
    pattern: /(銀行帳號|帳號|account number|bank account)\s*[:：=]\s*\S+/gi,
  },
  {
    category: "salary_amount_label",
    pattern: /(薪資|底薪|本薪|base salary|salary amount)\s*[:：=]\s*\$?\d[\d,]*/gi,
  },
  {
    category: "health_data_label",
    pattern: /(健康資料|病歷|診斷|health data|medical record|diagnosis)\s*[:：=]\s*\S+/gi,
  },
];

export function scanPilotEvidenceFiles(files: PilotEvidenceScanInputFile[]): PilotEvidenceScanReport {
  const findings = files.flatMap((file) => scanFile(file));
  const categoryCounts = new Map<PilotEvidenceSensitiveCategory, number>();
  for (const finding of findings) {
    categoryCounts.set(finding.category, (categoryCounts.get(finding.category) ?? 0) + finding.count);
  }

  return {
    status: findings.length === 0 ? "pass" : "failed",
    scannedFileCount: files.length,
    findingCount: findings.reduce((sum, finding) => sum + finding.count, 0),
    categories: [...categoryCounts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([category, count]) => ({ category, count })),
    findings: findings.sort((left, right) => {
      const pathCompare = left.path.localeCompare(right.path);
      return pathCompare === 0 ? left.category.localeCompare(right.category) : pathCompare;
    }),
  };
}

export function formatPilotEvidenceScanReport(report: PilotEvidenceScanReport) {
  return [
    `HR One pilot evidence scan: ${report.status}`,
    `Scanned files: ${report.scannedFileCount}`,
    `Findings: ${report.findingCount}`,
    "",
    "Categories:",
    ...formatCategories(report),
    "",
    "Files:",
    ...formatFindings(report),
    "",
    "The scanner reports category counts only and intentionally never prints matched sensitive values.",
  ].join("\n");
}

export function pilotEvidenceScanPassed(report: PilotEvidenceScanReport) {
  return report.status === "pass";
}

function scanFile(file: PilotEvidenceScanInputFile): PilotEvidenceScanFinding[] {
  return sensitivePatterns.flatMap(({ category, pattern }) => {
    const count = countMatches(file.content, pattern);
    return count > 0 ? [{ path: file.path, category, count }] : [];
  });
}

function countMatches(content: string, pattern: RegExp) {
  pattern.lastIndex = 0;
  const matches = content.match(pattern);
  return matches?.length ?? 0;
}

function formatCategories(report: PilotEvidenceScanReport) {
  if (report.categories.length === 0) return ["- none"];
  return report.categories.map((item) => `- ${item.category}: ${item.count}`);
}

function formatFindings(report: PilotEvidenceScanReport) {
  if (report.findings.length === 0) return ["- none"];
  return report.findings.map((finding) => `- ${finding.path}: ${finding.category} (${finding.count})`);
}
