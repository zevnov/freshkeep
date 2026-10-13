// openFDA food enforcement reports → product_recalls rows. Pure functions only.

export type FdaEnforcementReport = {
  recall_number?: string;
  product_description?: string;
  reason_for_recall?: string;
  recalling_firm?: string;
  classification?: string;
  status?: string;
  report_date?: string; // YYYYMMDD
  code_info?: string;
};

export type RecallRow = {
  recall_number: string;
  source: "fda";
  product_description: string;
  reason: string | null;
  recalling_firm: string | null;
  classification: string | null;
  status: string | null;
  report_date: string | null; // YYYY-MM-DD
  gtins: string[];
  url: string;
};

/** Left-pads a UPC/EAN to 14 digits so "012345678905" and "0012345678905" compare equal. */
export function toGtin14(code: string): string {
  return code.padStart(14, "0");
}

/** GS1 mod-10 check digit, so random lot numbers that happen to be 12 digits are ignored. */
export function hasValidCheckDigit(code: string): boolean {
  if (!/^\d{8,14}$/.test(code)) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop() as number;
  let sum = 0;
  // Weights alternate 3,1,3… starting from the digit next to the check digit.
  for (let i = digits.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += digits[i] * w;
  return (10 - (sum % 10)) % 10 === check;
}

/**
 * Barcodes printed in a recall's free text. Recalls write UPCs many ways ("UPC 0 41220 57766 4",
 * "UPC: 041220-577664", "041220577664"), so each run of digit groups separated by single spaces
 * or dashes is scanned token by token: a token that is a valid code on its own is taken as is,
 * otherwise consecutive tokens are joined while they add up to a 12–14 digit code with a valid
 * check digit. Lists of codes ("041220577668 041220577675") therefore stay separate.
 */
export function extractGtins(...texts: (string | undefined)[]): string[] {
  const found = new Set<string>();
  const isCode = (s: string) => s.length >= 12 && s.length <= 14 && hasValidCheckDigit(s);
  for (const text of texts) {
    if (!text) continue;
    for (const run of text.matchAll(/\d+(?:[ \-–]\d+)*/g)) {
      const tokens = run[0].split(/[ \-–]/);
      let i = 0;
      while (i < tokens.length) {
        if (isCode(tokens[i])) {
          found.add(toGtin14(tokens[i]));
          i += 1;
          continue;
        }
        let joined = tokens[i];
        let end = -1;
        for (let j = i + 1; j < tokens.length && joined.length + tokens[j].length <= 14; j++) {
          joined += tokens[j];
          if (isCode(joined)) {
            end = j;
            break;
          }
        }
        if (end >= 0) {
          found.add(toGtin14(joined));
          i = end + 1;
        } else {
          i += 1;
        }
      }
    }
  }
  return [...found].sort();
}

function clean(v: string | undefined, max: number): string | null {
  if (!v) return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
}

function isoDate(yyyymmdd: string | undefined): string | null {
  return yyyymmdd && /^\d{8}$/.test(yyyymmdd)
    ? `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`
    : null;
}

export function normalizeFdaReport(r: FdaEnforcementReport): RecallRow | null {
  const recallNumber = clean(r.recall_number, 40);
  const description = clean(r.product_description, 2000);
  if (!recallNumber || !description) return null;
  return {
    recall_number: recallNumber,
    source: "fda",
    product_description: description,
    reason: clean(r.reason_for_recall, 2000),
    recalling_firm: clean(r.recalling_firm, 200),
    classification: clean(r.classification, 40),
    status: clean(r.status, 40),
    report_date: isoDate(r.report_date),
    gtins: extractGtins(r.product_description, r.code_info),
    // The FDA enforcement report search; openFDA has no per-recall page, so the app shows the recall number to search for.
    url: "https://www.accessdata.fda.gov/scripts/ires/index.cfm",
  };
}

/** openFDA date-range syntax, e.g. report_date:[20260901 TO 20261012]. */
export function fdaDateRange(from: Date, to: Date): string {
  const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
  return `report_date:[${fmt(from)} TO ${fmt(to)}]`;
}
