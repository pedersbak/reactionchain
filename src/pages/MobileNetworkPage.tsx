import React, { useState, KeyboardEvent, useEffect, useRef } from "react";
import { useDebounce, useAuth, ReportModal, AiReportButton, MobileCardView, MobileRadialView } from "iris-ui";
import type { NetworkNodeData } from "iris-ui";
import { useExpandableGraph } from "../hooks/useExpandableGraph";
import { suggestCvr } from "../api/suggestApi";
import type { CvrSuggestion } from "../api/suggestApi";
import { fetchAiReport } from "../api/reportApi";

const DEFAULT_DEPTH = 1;

type ViewMode = "cards" | "radial";

export const MobileNetworkPage: React.FC = () => {
  const [inputValue, setInputValue] = useState("");
  const [entityId, setEntityId] = useState<number | null>(null);
  const [depth, setDepth] = useState(DEFAULT_DEPTH);
  const [includeHistoric, setIncludeHistoric] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("cards");

  // Card drill-down history stack — array of node IDs
  const [cardHistory, setCardHistory] = useState<string[]>([]);
  const currentCardId = cardHistory[cardHistory.length - 1] ?? null;

  const [reportMarkdown, setReportMarkdown] = useState<string | null>(null);
  const [reportTitle, setReportTitle] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const { tokens } = useAuth();

  const [suggestions, setSuggestions] = useState<CvrSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const userTypedRef = useRef(false);
  // Track which entityId the card history was last initialised for, so that
  // merging new nodes (which changes nodes.length) doesn't re-trigger the reset.
  const historyInitEntityRef = useRef<number | null>(null);

  const debouncedInput = useDebounce(inputValue, 250);

  useEffect(() => {
    if (!userTypedRef.current || debouncedInput.length < 3) {
      if (!userTypedRef.current) { setSuggestions([]); setShowSuggestions(false); }
      return;
    }
    suggestCvr(debouncedInput).then((results) => {
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
      setActiveIndex(-1);
    });
  }, [debouncedInput]);

  const { nodes, links, loading, navLoading, error, expandNode } = useExpandableGraph(entityId, depth, includeHistoric);

  // When a new entity loads for the first time, initialise the drill-down history.
  // We guard with historyInitEntityRef so that subsequent node expansions (which
  // also increase nodes.length) don't reset the history back to the root.
  useEffect(() => {
    if (entityId !== null && !loading && nodes.length > 0 && historyInitEntityRef.current !== entityId) {
      historyInitEntityRef.current = entityId;
      setCardHistory([String(entityId)]);
      setViewMode("cards");
      setReportError(null);
    }
  }, [entityId, loading, nodes.length]);

  const handleLoad = () => {
    const parsed = parseInt(inputValue.trim(), 10);
    if (!isNaN(parsed)) setEntityId(parsed);
    setShowSuggestions(false);
  };

  const pickSuggestion = (s: CvrSuggestion) => {
    userTypedRef.current = false;
    setInputValue(String(s.id));
    setEntityId(s.id);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && suggestions[activeIndex]) {
        pickSuggestion(suggestions[activeIndex]);
      } else {
        handleLoad();
      }
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  const handleCardNavigate = async (nodeId: string) => {
    await expandNode(nodeId);
    setCardHistory((h) => [...h, nodeId]);
  };

  const handleCardBack = () => {
    setCardHistory((h) => h.slice(0, -1));
  };

  const currentNode: NetworkNodeData | null =
    currentCardId ? (nodes.find((n) => n.id === currentCardId) ?? null) : null;

  const handleAiReport = async () => {
    if (!tokens?.token || !currentNode) return;
    const type = currentNode.type === "person" ? "person" : "company";
    const id = parseInt(currentNode.id, 10);
    setReportTitle(currentNode.label);
    setReportLoading(true);
    setReportMarkdown(null);
    setReportError(null);
    try {
      const md = await fetchAiReport(type, id, tokens.token);
      setReportMarkdown(md);
    } catch {
      setReportError("Rapporten kunne ikke hentes. Prøv igen om lidt.");
    } finally {
      setReportLoading(false);
    }
  };

  const showContent = entityId !== null && !loading && nodes.length > 0 && currentCardId !== null;

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#0d1117", overflow: "hidden" }}>

        {/* Search bar */}
        <div style={{ padding: "0.65rem 0.75rem", flexShrink: 0, zIndex: 10, background: "#0d1117", borderBottom: "1px solid #1e2638" }}>
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={inputValue}
                onChange={(e) => { userTypedRef.current = true; setInputValue(e.target.value); }}
                onKeyDown={handleKeyDown}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 300)}
                placeholder="Søg virksomhed eller person…"
                style={{
                  flex: 1, padding: "10px 14px", borderRadius: 8,
                  border: "1px solid #2a3347", fontSize: 15,
                  outline: "none", boxSizing: "border-box",
                  background: "#161b27", color: "#e2e8f0",
                }}
              />
              <button
                onClick={handleLoad}
                disabled={loading}
                style={{
                  padding: "0 20px", borderRadius: 8,
                  background: loading ? "#1e3a5f" : "#4f9cf9",
                  color: "#fff", border: "none",
                  cursor: loading ? "default" : "pointer",
                  fontSize: 15, fontWeight: 600, flexShrink: 0,
                }}
              >
                {loading ? "…" : "Go"}
              </button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
              <span style={{ fontSize: 13, color: "#8892a4", fontWeight: 600 }}>Depth</span>
              <button onClick={() => setDepth((d) => Math.max(1, d - 1))} disabled={loading || depth <= 1} style={stepperBtn}>−</button>
              <span style={{ minWidth: 18, textAlign: "center", fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>{depth}</span>
              <button onClick={() => setDepth((d) => Math.min(2, d + 1))} disabled={loading || depth >= 2} style={stepperBtn}>+</button>
              <button
                onClick={() => setIncludeHistoric((h) => !h)}
                style={{
                  marginLeft: 4, padding: "4px 10px", borderRadius: 6,
                  border: includeHistoric ? "1px dashed #a89450" : "1px solid #2a3347",
                  background: includeHistoric ? "#1e1a0d" : "#161b27",
                  color: includeHistoric ? "#a89450" : "#8892a4",
                  cursor: "pointer", fontSize: 12, fontWeight: 600,
                }}
              >
                Historic
              </button>
            </div>

            {cardHistory.length > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
                {cardHistory.map((id, i) => {
                  const n = nodes.find((nd) => nd.id === id);
                  const isLast = i === cardHistory.length - 1;
                  return (
                    <React.Fragment key={`${id}-${i}`}>
                      <button
                        onClick={() => !isLast && setCardHistory(cardHistory.slice(0, i + 1))}
                        style={{
                          background: "none", border: "none", padding: "2px 4px",
                          fontSize: 11, color: isLast ? "#e2e8f0" : "#4f9cf9",
                          cursor: isLast ? "default" : "pointer",
                          fontWeight: isLast ? 700 : 400,
                          maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}
                      >
                        {n?.label ?? id}
                      </button>
                      {!isLast && <span style={{ color: "#4b5563", fontSize: 11 }}>›</span>}
                    </React.Fragment>
                  );
                })}
              </div>
            )}

            {showSuggestions && (
              <ul style={{
                position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
                margin: 0, padding: 0, listStyle: "none",
                background: "#161b27", border: "1px solid #2a3347",
                borderRadius: 8, boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
                zIndex: 50, maxHeight: "40vh", overflowY: "auto",
              }}>
                {suggestions.map((s, i) => (
                  <li
                    key={s.id}
                    onMouseDown={(e) => { e.preventDefault(); pickSuggestion(s); }}
                    onTouchStart={(e) => { e.preventDefault(); pickSuggestion(s); }}
                    style={{
                      padding: "11px 14px", cursor: "pointer",
                      background: i === activeIndex ? "#1e2638" : "transparent",
                      borderBottom: i < suggestions.length - 1 ? "1px solid #1e2638" : "none",
                    }}
                  >
                    <div style={{ fontWeight: 600, color: "#e2e8f0", fontSize: 14 }}>{s.name}</div>
                    <div style={{ color: "#8892a4", fontSize: 12 }}>{s.id}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {error && (
          <div style={{
            margin: "0.5rem 0.75rem 0", padding: "10px 14px", borderRadius: 8,
            background: "rgba(185,28,28,0.15)", border: "1px solid #7f1d1d",
            color: "#fca5a5", fontSize: 13, flexShrink: 0,
          }}>
            {error}
          </div>
        )}
        {reportError && (
          <div style={{
            margin: "0.5rem 0.75rem 0", padding: "8px 14px", borderRadius: 8,
            background: "rgba(185,28,28,0.1)", border: "1px solid #7f1d1d",
            color: "#fca5a5", fontSize: 12, flexShrink: 0,
          }}>
            {reportError}
          </div>
        )}

        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>

          {loading && (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#8892a4", fontSize: 14 }}>
              Henter netværk…
            </div>
          )}

          {!loading && entityId === null && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#e2e8f0" }}>Intet netværk indlæst</div>
              <div style={{ fontSize: 12, color: "#8892a4", textAlign: "center", maxWidth: 220, lineHeight: 1.6 }}>
                Søg efter en virksomhed eller person for at udforske deres netværk
              </div>
            </div>
          )}

          {!loading && entityId !== null && !error && nodes.length === 0 && (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#4b5563", fontSize: 14 }}>
              Ingen data
            </div>
          )}

          {showContent && viewMode === "cards" && (
            <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              {cardHistory.length > 1 && (
                <button style={backBtnStyle} onClick={handleCardBack}>
                  ← Tilbage
                </button>
              )}
              {navLoading && (
                <div style={{ padding: "7px 16px", background: "#0a1628", borderBottom: "1px solid #1e2638", fontSize: 12, color: "#4f9cf9", flexShrink: 0 }}>
                  Henter relationer…
                </div>
              )}
              <div style={{ flex: 1, overflowY: "auto" }}>
                <MobileCardView
                  rootId={currentCardId!}
                  nodes={nodes}
                  links={links}
                  onNavigate={handleCardNavigate}
                  onShowRadial={() => setViewMode("radial")}
                  actionSlot={
                    <AiReportButton loading={reportLoading} onClick={handleAiReport} />
                  }
                />
              </div>
            </div>
          )}

          {showContent && viewMode === "radial" && (
            <MobileRadialView
              rootId={currentCardId!}
              nodes={nodes}
              links={links}
              onNavigate={async (nodeId) => {
                await expandNode(nodeId);
                setCardHistory((h) => [...h, nodeId]);
                setViewMode("cards");
              }}
              onBack={() => setViewMode("cards")}
            />
          )}
        </div>
      </div>

      {reportMarkdown && (
        <ReportModal
          title={reportTitle}
          markdown={reportMarkdown}
          onClose={() => setReportMarkdown(null)}
        />
      )}
    </>
  );
};

const stepperBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 6,
  border: "1px solid #2a3347", background: "#161b27",
  cursor: "pointer", fontSize: 17, lineHeight: 1,
  display: "flex", alignItems: "center", justifyContent: "center",
  fontWeight: 700, color: "#e2e8f0", padding: 0,
};

const backBtnStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 6,
  padding: "10px 16px", background: "none",
  border: "none", borderBottom: "1px solid #1e2638",
  color: "#4f9cf9", fontSize: 14, fontWeight: 600,
  cursor: "pointer", flexShrink: 0, textAlign: "left",
  width: "100%",
};
