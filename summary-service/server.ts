import express, { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Config ──────────────────────────────────────────────────────────────────

const PORT        = process.env.PORT        ?? "3001";
const CVR_ES_URL  = process.env.CVR_ES_URL  ?? "https://distribution.virk.dk/cvr-permanent/virksomhed/_search";
const CVR_ES_USER = process.env.CVR_ES_USER ?? "";
const CVR_ES_PASS = process.env.CVR_ES_PASS ?? "";
const GROQ_API_KEY = process.env.GROQ_API_KEY ?? "";
const GROQ_MODEL   = "llama-3.3-70b-versatile";

if (!GROQ_API_KEY) {
  console.warn("⚠️  GROQ_API_KEY is not set — AI summary will fail.");
}

// ─── Load templates once at startup ──────────────────────────────────────────

const PROMPT_TEMPLATE = fs.readFileSync(
  path.join(__dirname, "../prompts/company-summary.txt"),
  "utf-8"
);

const QUERY_TEMPLATE: Record<string, unknown> = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../queries/company-query.json"), "utf-8")
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildQuery(cvrNummer: number): Record<string, unknown> {
  // Deep-clone the template and inject the CVR number
  const q = JSON.parse(JSON.stringify(QUERY_TEMPLATE)) as {
    query: { bool: { filter: { terms: { "Vrvirksomhed.cvrNummer": number[] } } } };
  };
  q.query.bool.filter.terms["Vrvirksomhed.cvrNummer"] = [cvrNummer];
  return q;
}

function basicAuthHeader(): string | null {
  if (!CVR_ES_USER || !CVR_ES_PASS) return null;
  return "Basic " + Buffer.from(`${CVR_ES_USER}:${CVR_ES_PASS}`).toString("base64");
}

// ─── Express app ─────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

/**
 * GET /summary/:cvrNummer
 *
 * Fetches company data from the CVR Elasticsearch API and returns an
 * AI-generated markdown summary via Groq.
 *
 * Response: { cvrNummer: number, summary: string }
 */
app.get("/summary/:cvrNummer", async (req: Request, res: Response) => {
  const cvrNummer = parseInt(req.params.cvrNummer, 10);
  if (isNaN(cvrNummer) || cvrNummer <= 0) {
    res.status(400).json({ error: "Invalid CVR number" });
    return;
  }

  // ── 1. Fetch CVR data from Elasticsearch ──────────────────────────────────
  let cvrData: unknown;
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const auth = basicAuthHeader();
    if (auth) headers["Authorization"] = auth;

    const cvrRes = await fetch(CVR_ES_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(buildQuery(cvrNummer)),
    });

    if (!cvrRes.ok) {
      const body = await cvrRes.text();
      console.error("CVR API error:", cvrRes.status, body);
      res.status(502).json({ error: `CVR API returned ${cvrRes.status}` });
      return;
    }

    cvrData = await cvrRes.json();

    // Check the hit actually exists
    const hits = (cvrData as { hits?: { total?: number | { value: number } } })
      ?.hits?.total;
    const totalHits = typeof hits === "number" ? hits : hits?.value ?? 0;
    if (totalHits === 0) {
      res.status(404).json({ error: `No active company found for CVR ${cvrNummer}` });
      return;
    }
  } catch (err) {
    console.error("Failed to reach CVR API:", err);
    res.status(502).json({ error: "Failed to reach CVR API" });
    return;
  }

  // ── 2. Generate summary via Groq ──────────────────────────────────────────
  let summary: string;
  try {
    const userMessage = `${PROMPT_TEMPLATE}\n\n${JSON.stringify(cvrData)}`;

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: "user", content: userMessage }],
        temperature: 0.2,
      }),
    });

    if (!groqRes.ok) {
      const body = await groqRes.text();
      console.error("Groq API error:", groqRes.status, body);
      res.status(502).json({ error: `Groq API returned ${groqRes.status}` });
      return;
    }

    const groqData = await groqRes.json() as {
      choices: { message: { content: string } }[];
    };
    summary = groqData.choices[0].message.content;
  } catch (err) {
    console.error("Failed to generate summary:", err);
    res.status(502).json({ error: "Failed to generate AI summary" });
    return;
  }

  res.json({ cvrNummer, summary });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(parseInt(PORT, 10), () => {
  console.log(`✅ CVR summary service running on http://localhost:${PORT}`);
  console.log(`   GET http://localhost:${PORT}/summary/<cvrNummer>`);
});
