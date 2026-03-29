/**
 * Fetch an AI-generated markdown summary for a company by CVR number.
 * Calls the summary-service via the Vite proxy at /api/summary.
 */
export interface CompanySummaryResult {
  cvrNummer: number;
  summary: string;
}

export async function fetchCompanySummary(
  cvrNummer: number
): Promise<CompanySummaryResult> {
  const res = await fetch(`/api/summary/${cvrNummer}`);

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Summary API error ${res.status}`);
  }

  return res.json() as Promise<CompanySummaryResult>;
}
