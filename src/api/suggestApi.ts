export interface CvrSuggestion {
  id: number;
  name: string;
}

const SUGGEST_BASE = "/api/suggest";

export async function suggestCvr(query: string): Promise<CvrSuggestion[]> {
  if (query.length < 3) return [];
  const res = await fetch(`${SUGGEST_BASE}?querystring=${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  const json = await res.json() as { data?: CvrSuggestion[] };
  return json.data ?? [];
}
