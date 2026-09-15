export interface AppConfig {
  port: number;
  nodeEnv: string;
  corsOrigins: string[];
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: string;
    refreshTtl: string;
  };
  bcryptRounds: number;
  uploadDir: string;
  publicUploadBase: string;
  privateMemberDocumentDir: string;
  privateOnlineProofDir: string;
  redis: {
    url: string | null;
  };
  payroll: {
    /** Days used to derive the daily/hourly rate (legacy fixed 30). */
    workingDays: number;
    /** Hours per working day (legacy fixed 8). */
    hoursPerDay: number;
    /** Weekly off-day used when an employee has no configured off-day. */
    defaultOffDay: string;
    /** Employee codes exempt from absence/lateness deductions (legacy hardcoded set). */
    deductionExemptEmpCodes: number[];
  };
}

/** Parse a comma-separated list of integers from an env var. */
function parseIntList(value: string | undefined): number[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n));
}

const DEV_ACCESS_FALLBACK = "dev-access-secret";
const DEV_REFRESH_FALLBACK = "dev-refresh-secret";

/**
 * Resolve a JWT secret. In production we refuse to boot with a missing or default
 * secret — otherwise anyone who knows the well-known dev value could forge tokens.
 */
function resolveSecret(
  value: string | undefined,
  fallback: string,
  name: string,
): string {
  const isProd = (process.env.NODE_ENV ?? "development") === "production";
  // Reject: missing, the well-known dev fallback, the shipped placeholder, or anything
  // too short/low-entropy to be a real secret. Prevents forging tokens with a known value.
  const isPlaceholder =
    !!value &&
    (value.includes("<<") ||
      value.includes("FILL") ||
      value.includes("CHANGE"));
  const tooWeak = !!value && value.length < 32;
  if (isProd && (!value || value === fallback || isPlaceholder || tooWeak)) {
    throw new Error(
      `[config] ${name} must be set to a strong, unique value in production ` +
        `(≥32 chars, not the placeholder). Generate one with: openssl rand -hex 32. Refusing to start.`,
    );
  }
  return value ?? fallback;
}

export default (): AppConfig => ({
  port: parseInt(process.env.PORT ?? "4000", 10),
  nodeEnv: process.env.NODE_ENV ?? "development",
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  jwt: {
    accessSecret: resolveSecret(
      process.env.JWT_ACCESS_SECRET,
      DEV_ACCESS_FALLBACK,
      "JWT_ACCESS_SECRET",
    ),
    refreshSecret: resolveSecret(
      process.env.JWT_REFRESH_SECRET,
      DEV_REFRESH_FALLBACK,
      "JWT_REFRESH_SECRET",
    ),
    accessTtl: process.env.JWT_ACCESS_TTL ?? "2h",
    refreshTtl: process.env.JWT_REFRESH_TTL ?? "7d",
  },
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS ?? "12", 10),
  uploadDir: process.env.UPLOAD_DIR ?? "./uploads",
  publicUploadBase: process.env.PUBLIC_UPLOAD_BASE ?? "/uploads",
  privateMemberDocumentDir: process.env.PRIVATE_MEMBER_DOCUMENT_DIR ?? "./private-member-documents",
  privateOnlineProofDir: process.env.PRIVATE_ONLINE_PROOF_DIR ?? "./private-online-proofs",
  redis: {
    url: process.env.REDIS_URL ?? null,
  },
  payroll: {
    workingDays: parseInt(process.env.PAYROLL_WORKING_DAYS ?? "30", 10),
    hoursPerDay: parseInt(process.env.PAYROLL_HOURS_PER_DAY ?? "8", 10),
    defaultOffDay: process.env.PAYROLL_DEFAULT_OFF_DAY ?? "Friday",
    // Phase 2 will promote this to an employees.exempt_from_deductions DB column.
    deductionExemptEmpCodes: parseIntList(
      process.env.PAYROLL_DEDUCTION_EXEMPT_EMP_CODES ?? "27,2,3,58,29,39",
    ),
  },
});
