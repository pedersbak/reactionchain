/**
 * Fetch an AI-generated Markdown report for a company or person.
 * API: GET /api/AiReport/company/{cvrNummer}
 *      GET /api/AiReport/person/{personNummer}
 *
 * Returns raw Markdown text.
 */
export async function fetchAiReport(
  type: "company" | "person",
  id: number,
  token: string
): Promise<string> {
  const res = await fetch(`/api/AiReport/${type}/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`AI Report API error ${res.status}: ${res.statusText}`);
  }

  return res.text();
}
