import React, { useState, KeyboardEvent, useEffect, useRef } from "react";
import { NetworkGraph, useDebounce, useAuth, ReportModal, AiReportButton, MobileCardView } from "iris-ui";
import type { NetworkNodeData, NetworkLinkData } from "iris-ui";
import { useExpandableGraph } from "../hooks/useExpandableGraph";
import { GRAPH_DIMENSIONS } from "../hooks/useNetworkData";
import { suggestCvr } from "../api/suggestApi";
import type { CvrSuggestion } from "../api/suggestApi";
import { fetchAiReport } from "../api/reportApi";

const DEFAULT_DEPTH = 1;
const PANEL_WIDTH = 308;

// Fictional placeholder network shown before the user searches for anything.
const MOCK_NODES: NetworkNodeData[] = [
  { id: "m1", label: "ACME Holding A/S",    type: "company", x: 750,  y: 440 },
  { id: "m2", label: "Nordic Ventures ApS", type: "company", x: 220,  y: 160 },
  { id: "m3", label: "Baltic Trading A/S",  type: "company", x: 1250, y: 180 },
  { id: "m4", label: "Anders Eksempel",      type: "person",  x: 380,  y: 680 },
  { id: "m5", label: "Southern Group ApS",  type: "company", x: 1120, y: 660 },
];
const MOCK_LINKS: NetworkLinkData[] = [
  { id: "ml1", sourceId: "m1", targetId: "m2", labels: ["Ejer"],          color: "#2a3347", strokeWidth: 1.5 },
  { id: "ml2", sourceId: "m1", targetId: "m3", labels: ["Datterselskab"], color: "#2a3347", strokeWidth: 1.5 },
  { id: "ml3", sourceId: "m4", targetId: "m1", labels: ["Direktør"],      color: "#2a3347", strokeWidth: 1.5 },
  { id: "ml4", sourceId: "m1", targetId: "m5", labels: ["Ejer"],          color: "#2a3347", strokeWidth: 1.5 },
];

export const NetworkTestPage: React.FC = () => {
  const [inputValue, setInputValue] = useState("");
  const [entityId, setEntityId] = useState<number | null>(null);
  const [depth, setDepth] = useState(DEFAULT_DEPTH);
  const [includeHistoric, setIncludeHistoric] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [reportMarkdown, setReportMarkdown] = useState<string | null>(null);
  const [reportTitle, setReportTitle] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  // Card drill-down history stack — array of node IDs
  const [cardHistory, setCardHistory] = useState<string[]>([]);
  const currentCardId = cardHistory[cardHistory.length - 1] ?? null;

  const { tokens } = useAuth();

  const [suggestions, setSuggestions] = useState<CvrSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const userTypedRef = useRef(false);
  const historyInitEntityRef = useRef<number | null>(null);
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const [graphSize, setGraphSize] = useState<{ w: number; h: number }>({ w: GRAPH_DIMENSIONS.width, h: GRAPH_DIMENSIONS.height });

  // Track the graph card's actual pixel size so we can scale the canvas to fit.
  useEffect(() => {
    const el = graphContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setGraphSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const debouncedInput = useDebounce(inputValue, 250);

  useEffect(() => {
    if (!userTypedRef.current || debouncedInput.length < 3) {
      if (!userTypedRef.current) {
        setSuggestions([]);
        setShowSuggestions(false);
      }
      return;
    }
    suggestCvr(debouncedInput).then((results) => {
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
      setActiveIndex(-1);
    });
  }, [debouncedInput]);

  const { nodes, links, loading, navLoading, error, layoutRevision, expandNode } = useExpandableGraph(entityId, depth, includeHistoric);

  // Initialise card history when a new entity's data first arrives.
  useEffect(() => {
    if (entityId !== null && !loading && nodes.length > 0 && historyInitEntityRef.current !== entityId) {
      historyInitEntityRef.current = entityId;
      setCardHistory([String(entityId)]);
      setReportError(null);
    }
  }, [entityId, loading, nodes.length]);

  // Build the filtered graph for the visualisation:
  // • The breadcrumb path (one link per consecutive pair)
  // • All nodes/links within `depth` hops of the current card node
  const { graphNodes, graphLinks } = React.useMemo(() => {
    if (!currentCardId || nodes.length === 0) return { graphNodes: nodes, graphLinks: links };

    const visibleNodeIds = new Set<string>();
    const visibleLinkIds = new Set<string>();

    // 1. Path: keep breadcrumb nodes + one link connecting each consecutive pair
    cardHistory.forEach((id) => visibleNodeIds.add(id));
    for (let i = 0; i < cardHistory.length - 1; i++) {
      const a = cardHistory[i];
      const b = cardHistory[i + 1];
      const pathLink = links.find(
        (l) => (l.sourceId === a && l.targetId === b) || (l.sourceId === b && l.targetId === a)
      );
      if (pathLink) visibleLinkIds.add(pathLink.id);
    }

    // 2. BFS outward from currentCardId up to `depth` hops
    let frontier = new Set<string>([currentCardId]);
    visibleNodeIds.add(currentCardId);
    for (let hop = 0; hop < depth; hop++) {
      const nextFrontier = new Set<string>();
      for (const l of links) {
        const fromFrontier = frontier.has(l.sourceId) || frontier.has(l.targetId);
        if (!fromFrontier) continue;
        visibleLinkIds.add(l.id);
        [l.sourceId, l.targetId].forEach((id) => {
          if (!visibleNodeIds.has(id)) {
            visibleNodeIds.add(id);
            nextFrontier.add(id);
          }
        });
      }
      frontier = nextFrontier;
      if (frontier.size === 0) break;
    }

    return {
      graphNodes: nodes.filter((n) => visibleNodeIds.has(n.id)),
      graphLinks: links.filter((l) => visibleLinkIds.has(l.id)),
    };
  }, [currentCardId, cardHistory, depth, nodes, links]);

  const handleLoad = () => {
    const parsed = parseInt(inputValue.trim(), 10);
    if (!isNaN(parsed)) {
      setEntityId(parsed);
    }
    setShowSuggestions(false);
  };

  const pickSuggestion = (s: CvrSuggestion) => {
    userTypedRef.current = false;
    setInputValue(String(s.id));
    setEntityId(s.id);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleNodeClick = async (node: NetworkNodeData) => {
    setInputValue(node.id);
    await expandNode(node.id, 1);
    setCardHistory((h) => [...h, node.id]);
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

  // Derive current node from the top of the card history stack
  const currentNode: NetworkNodeData | null =
    currentCardId ? (nodes.find((n) => n.id === currentCardId) ?? null) : null;

  return (
    <>
    <div style={{ display: "flex", flex: 1, overflow: "auto", padding: "1rem", flexDirection: "column" }}>

      {error && (
        <div style={{
          padding: "10px 14px", borderRadius: 8,
          background: "rgba(185,28,28,0.15)", border: "1px solid #7f1d1d",
          color: "#fca5a5", fontSize: 13, marginBottom: "0.75rem",
        }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "stretch", position: "relative", flex: 1 }}>

        {/* Graph canvas card */}
        <div ref={graphContainerRef} style={{
          flex: 1,
          border: "1px solid #1e2638", borderRadius: 12,
          background: "#111827", boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
          overflow: "hidden", position: "relative",
        }}>
          {loading && (
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(13,17,23,0.85)", fontSize: 14, color: "#8892a4", zIndex: 20,
            }}>
              Fetching network data…
            </div>
          )}

          {/* Single graph — mocked (dimmed) when idle, real when loaded */}
          {!loading && (entityId === null || nodes.length > 0) && (() => {
            const scale = Math.min(
              graphSize.w / GRAPH_DIMENSIONS.width,
              graphSize.h / GRAPH_DIMENSIONS.height
            );
            return (
              <div style={entityId === null ? { opacity: 0.15, filter: "grayscale(1) blur(1.5px)", pointerEvents: "none" } : {}}>
                <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: GRAPH_DIMENSIONS.width, height: GRAPH_DIMENSIONS.height }}>
                  <NetworkGraph
                    nodes={entityId === null ? MOCK_NODES : graphNodes}
                    links={entityId === null ? MOCK_LINKS : graphLinks}
                    width={GRAPH_DIMENSIONS.width}
                    height={GRAPH_DIMENSIONS.height}
                    onNodeClick={handleNodeClick}
                    primaryNodeId={currentCardId ?? (entityId !== null ? String(entityId) : undefined)}
                    layoutRevision={layoutRevision}
                  />
                </div>
              </div>
            );
          })()}

          {/* Overlay shown before any search */}
          {!loading && entityId === null && (
            <div style={{
              position: "absolute", inset: 0, zIndex: 10,
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              gap: 8,
            }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#e2e8f0" }}>
                No network loaded
              </div>
              <div style={{ fontSize: 12, color: "#8892a4", textAlign: "center", maxWidth: 240, lineHeight: 1.6 }}>
                Search for a company or person in the panel to explore their network
              </div>
              <div style={{ fontSize: 10, color: "#2a3347", marginTop: 4, letterSpacing: "0.05em", textTransform: "uppercase", fontWeight: 700 }}>
                — preview only —
              </div>
            </div>
          )}

          {/* No results after a real search */}
          {!loading && entityId !== null && !error && nodes.length === 0 && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              height: "100%", color: "#4b5563", fontSize: 14,
            }}>
              No data
            </div>
          )}
        </div>

        {/* Collapse / expand tab */}
        <button
          onClick={() => setPanelOpen((o) => !o)}
          title={panelOpen ? "Collapse panel" : "Expand panel"}
          style={{
            position: "absolute",
            right: panelOpen ? PANEL_WIDTH + 10 : 0,
            top: "50%",
            transform: "translateY(-50%)",
            transition: "right 0.25s ease",
            zIndex: 30,
            width: 18, height: 52,
            background: "#161b27",
            border: "1px solid #1e2638",
            borderRight: "none",
            borderRadius: "6px 0 0 6px",
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 0, color: "#8892a4", fontSize: 13,
            boxShadow: "-2px 0 6px rgba(0,0,0,0.3)",
          }}
        >
          {panelOpen ? "›" : "‹"}
        </button>

        {/* Panel width controller */}
        <div style={{
          width: panelOpen ? PANEL_WIDTH : 0,
          flexShrink: 0,
          overflow: "hidden",
          transition: "width 0.25s ease",
        }}>
          {/* Panel card — same styling as graph card */}
          <div style={{
            width: PANEL_WIDTH,
            height: "100%",
            border: "1px solid #1e2638",
            borderRadius: 12,
            background: "#161b27",
            boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}>
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>

              {/* Search section */}
              <div style={{ padding: "1rem 1rem 0" }}>
                <div style={sectionLabel}>Search</div>

                <div style={{ position: "relative", marginBottom: 8 }}>
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => { userTypedRef.current = true; setInputValue(e.target.value); }}
                    onKeyDown={handleKeyDown}
                    onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 300)}
                    placeholder="Name or CVR…"
                    style={{
                      padding: "7px 11px", borderRadius: 7,
                      border: "1px solid #2a3347", fontSize: 13,
                      width: "100%", outline: "none", boxSizing: "border-box",
                      background: "#0d1117", color: "#e2e8f0",
                    }}
                  />
                  {showSuggestions && (
                    <ul
                      style={{
                        position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
                        margin: 0, padding: 0, listStyle: "none",
                        background: "#161b27", border: "1px solid #2a3347",
                        borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
                        zIndex: 50, maxHeight: "40vh", overflowY: "auto",
                      }}>
                      {suggestions.map((s, i) => (
                        <li
                          key={s.id}
                          onMouseDown={(e) => { e.preventDefault(); pickSuggestion(s); }}
                          onTouchStart={(e) => { e.preventDefault(); pickSuggestion(s); }}
                          onMouseEnter={() => setActiveIndex(i)}
                          style={{
                            padding: "8px 12px", cursor: "pointer",
                            background: i === activeIndex ? "#1e2638" : "transparent",
                            borderBottom: i < suggestions.length - 1 ? "1px solid #1e2638" : "none",
                          }}
                        >
                          <div style={{ fontWeight: 600, color: "#e2e8f0", fontSize: 12 }}>{s.name}</div>
                          <div style={{ color: "#8892a4", fontSize: 11 }}>{s.id}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: "1rem" }}>
                  <span style={{ fontSize: 12, color: "#8892a4", fontWeight: 600 }}>Depth</span>
                  <button onClick={() => setDepth((d) => Math.max(1, d - 1))} disabled={loading || depth <= 1} style={stepperBtn}>−</button>
                  <span style={{ minWidth: 16, textAlign: "center", fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>{depth}</span>
                  <button onClick={() => setDepth((d) => Math.min(2, d + 1))} disabled={loading || depth >= 2} style={stepperBtn}>+</button>
                  <button
                    onClick={() => {
                      // If the user has navigated away from the root entity, make the
                      // current card the new root so the re-fetch keeps their context.
                      if (currentCardId && currentCardId !== String(entityId)) {
                        const focusedId = parseInt(currentCardId, 10);
                        if (!isNaN(focusedId)) {
                          setEntityId(focusedId);
                          setInputValue(currentCardId);
                        }
                      }
                      setIncludeHistoric((h) => !h);
                    }}
                    title="Include historic relations"
                    style={{
                      marginLeft: 4,
                      padding: "3px 9px", borderRadius: 5,
                      border: includeHistoric ? "1px dashed #a89450" : "1px solid #2a3347",
                      background: includeHistoric ? "#1e1a0d" : "#161b27",
                      color: includeHistoric ? "#a89450" : "#8892a4",
                      cursor: "pointer", fontSize: 11, fontWeight: 600,
                    }}
                  >
                    Historic
                  </button>
                  <button
                    onClick={handleLoad}
                    disabled={loading}
                    style={{
                      marginLeft: "auto", padding: "6px 16px", borderRadius: 7,
                      background: loading ? "#1e3a5f" : "#4f9cf9",
                      color: "#fff", border: "none",
                      cursor: loading ? "default" : "pointer",
                      fontSize: 12, fontWeight: 600,
                    }}
                  >
                    {loading ? "…" : "Load"}
                  </button>
                </div>
              </div>

              <div style={{ borderTop: "1px solid #1e2638", margin: "0 1rem" }} />

              {/* Card drill-down section */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>

                {/* Breadcrumb trail */}
                {cardHistory.length > 1 && (
                  <div style={{ padding: "8px 12px 0", display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                    {cardHistory.map((id, i) => {
                      const n = nodes.find((nd) => nd.id === id);
                      const isLast = i === cardHistory.length - 1;
                      return (
                        <React.Fragment key={`${id}-${i}`}>
                          <button
                            onClick={() => !isLast && setCardHistory(cardHistory.slice(0, i + 1))}
                            style={{
                              background: "none", border: "none", padding: "1px 3px",
                              fontSize: 10, color: isLast ? "#e2e8f0" : "#4f9cf9",
                              cursor: isLast ? "default" : "pointer",
                              fontWeight: isLast ? 700 : 400,
                              maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}
                          >
                            {n?.label ?? id}
                          </button>
                          {!isLast && <span style={{ color: "#4b5563", fontSize: 10 }}>›</span>}
                        </React.Fragment>
                      );
                    })}
                  </div>
                )}

                {/* Back button */}
                {cardHistory.length > 1 && (
                  <button
                    onClick={() => setCardHistory((h) => h.slice(0, -1))}
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      padding: "6px 14px", background: "none",
                      border: "none", borderBottom: "1px solid #1e2638",
                      color: "#4f9cf9", fontSize: 12, fontWeight: 600,
                      cursor: "pointer", textAlign: "left", width: "100%",
                    }}
                  >
                    ← Tilbage
                  </button>
                )}

                {/* Nav loading indicator */}
                {navLoading && (
                  <div style={{ padding: "5px 14px", background: "#0a1628", borderBottom: "1px solid #1e2638", fontSize: 11, color: "#4f9cf9" }}>
                    Henter relationer…
                  </div>
                )}

                {/* Card view */}
                {currentCardId && (
                  <div style={{ flex: 1, overflowY: "auto" }}>
                    <MobileCardView
                      rootId={currentCardId}
                      nodes={nodes}
                      links={links}
                      onNavigate={async (nodeId) => {
                        setInputValue(nodeId);
                        await expandNode(nodeId, 1);
                        setCardHistory((h) => [...h, nodeId]);
                      }}
                      onShowRadial={() => {}}
                      hideRadialButton
                      actionSlot={
                        currentNode ? (
                          <AiReportButton
                            loading={reportLoading}
                            onClick={async () => {
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
                                setReportError("Rapporten kunne ikke hentes. Prøv igen.");
                              } finally {
                                setReportLoading(false);
                              }
                            }}
                          />
                        ) : undefined
                      }
                    />
                    {reportError && (
                      <div style={{ fontSize: 11, color: "#f87171", padding: "4px 14px" }}>
                        ⚠ {reportError}
                      </div>
                    )}
                  </div>
                )}

                {!currentCardId && (
                  <div style={{ fontSize: 12, color: "#4b5563", textAlign: "center", marginTop: 32 }}>
                    Click a node to explore
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>

      </div>

      {!loading && nodes.length > 0 && (
        <div style={{ marginTop: "0.6rem", display: "flex", gap: "1rem", fontSize: "0.78rem", color: "#8892a4" }}>
          <span><strong style={{ color: "#e2e8f0" }}>{nodes.length}</strong> entities</span>
          <span><strong style={{ color: "#e2e8f0" }}>{links.length}</strong> relations</span>
          <span><strong style={{ color: "#e2e8f0" }}>{nodes.filter((n) => n.type === "person").length}</strong> persons</span>
          <span><strong style={{ color: "#e2e8f0" }}>{nodes.filter((n) => n.type === "company").length}</strong> companies</span>
        </div>
      )}
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

const sectionLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "#4f9cf9",
  textTransform: "uppercase",
  letterSpacing: "0.07em",
  marginBottom: 8,
};

const stepperBtn: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 5,
  border: "1px solid #2a3347",
  background: "#161b27",
  cursor: "pointer",
  fontSize: 15,
  lineHeight: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 700,
  color: "#e2e8f0",
  padding: 0,
};
