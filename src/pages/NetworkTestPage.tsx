import React, { useState, KeyboardEvent, useEffect, useRef, useMemo } from "react";
import { NetworkGraph, useDebounce } from "iris-ui";
import type { NetworkNodeData, NetworkLinkData } from "iris-ui";
import { useNetworkData, GRAPH_DIMENSIONS } from "../hooks/useNetworkData";
import { suggestCvr } from "../api/suggestApi";
import type { CvrSuggestion } from "../api/suggestApi";

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
  const [selectedNode, setSelectedNode] = useState<NetworkNodeData | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [secondaryOpen, setSecondaryOpen] = useState(false);

  const [suggestions, setSuggestions] = useState<CvrSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const userTypedRef = useRef(false);
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

  const { nodes, links, loading, error } = useNetworkData(entityId, depth, includeHistoric);

  // Auto-select the searched entity once nodes are loaded.
  useEffect(() => {
    if (loading || nodes.length === 0 || entityId === null) return;
    const primary = nodes.find((n) => n.id === String(entityId));
    if (primary) setSelectedNode(primary);
  }, [entityId, nodes, loading]);

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

  const handleNodeClick = (node: NetworkNodeData) => {
    setSelectedNode(node);
    const parsed = parseInt(node.id, 10);
    if (!isNaN(parsed)) {
      userTypedRef.current = false;
      setInputValue(node.id);
      setEntityId(parsed);
    }
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

  type RelEntry = { id: string; otherId: string; otherName: string; otherType: string; labels: string[] };

  // BFS distances from entityId across the full visible graph.
  const nodeDistances = useMemo(() => {
    if (entityId === null || nodes.length === 0) return new Map<string, number>();
    const pid = String(entityId);
    const dist = new Map<string, number>();
    dist.set(pid, 0);
    const queue = [pid];
    const adj = new Map<string, string[]>();
    for (const l of links) {
      if (!adj.has(l.sourceId)) adj.set(l.sourceId, []);
      if (!adj.has(l.targetId)) adj.set(l.targetId, []);
      adj.get(l.sourceId)!.push(l.targetId);
      adj.get(l.targetId)!.push(l.sourceId);
    }
    while (queue.length > 0) {
      const curr = queue.shift()!;
      const d = dist.get(curr)!;
      for (const nb of (adj.get(curr) ?? [])) {
        if (!dist.has(nb)) { dist.set(nb, d + 1); queue.push(nb); }
      }
    }
    return dist;
  }, [entityId, nodes, links]);

  // All visible graph nodes (except entityId itself) split by distance.
  const { primaryRelations, secondaryRelations } = useMemo<{ primaryRelations: RelEntry[]; secondaryRelations: RelEntry[] }>(() => {
    if (entityId === null) return { primaryRelations: [], secondaryRelations: [] };
    const pid = String(entityId);
    const primary: RelEntry[] = [];
    const secondary: RelEntry[] = [];
    for (const n of nodes) {
      if (n.id === pid) continue;
      const dist = nodeDistances.get(n.id) ?? 99;
      const directLink = links.find(
        (l) => (l.sourceId === pid && l.targetId === n.id) || (l.targetId === pid && l.sourceId === n.id)
      );
      const entry: RelEntry = {
        id: `rel-${n.id}`,
        otherId: n.id,
        otherName: n.label,
        otherType: n.type,
        labels: directLink ? (directLink.labels ?? (directLink.label ? [directLink.label] : [])) : [],
      };
      if (dist === 1) primary.push(entry);
      else secondary.push(entry);
    }
    return { primaryRelations: primary, secondaryRelations: secondary };
  }, [entityId, nodes, links, nodeDistances]);

  // Collapse secondary section whenever the searched entity changes.
  useEffect(() => { setSecondaryOpen(false); }, [entityId]);

  const renderRelCard = (r: RelEntry) => (
    <div
      key={r.id}
      onClick={() => {
        const parsed = parseInt(r.otherId, 10);
        if (!isNaN(parsed)) {
          userTypedRef.current = false;
          setInputValue(r.otherId);
          setEntityId(parsed);
        }
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#1e2638")}
      onMouseLeave={(e) => (e.currentTarget.style.background = hoveredNodeId === r.otherId ? "#1e2638" : "#0d1117")}
      style={{
        padding: "7px 10px", borderRadius: 7,
        background: hoveredNodeId === r.otherId ? "#1e2638" : "#0d1117",
        border: hoveredNodeId === r.otherId ? "1px solid #4f9cf9" : "1px solid #2a3347",
        cursor: "pointer",
        transition: "background 0.15s ease, border-color 0.15s ease",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", marginBottom: r.labels.length > 0 ? 4 : 0 }}>
        {r.otherName}
      </div>
      {r.labels.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
          {r.labels.map((lbl, li) => (
            <span key={li} style={{
              fontSize: 10, padding: "1px 6px", borderRadius: 3,
              background: "#0e1e3d", color: "#4f9cf9", fontWeight: 600,
            }}>
              {lbl}
            </span>
          ))}
        </div>
      )}
    </div>
  );

  return (
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
                    nodes={entityId === null ? MOCK_NODES : nodes}
                    links={entityId === null ? MOCK_LINKS : links}
                    width={GRAPH_DIMENSIONS.width}
                    height={GRAPH_DIMENSIONS.height}
                    onNodeClick={handleNodeClick}
                    onNodeHover={(n) => setHoveredNodeId(n?.id ?? null)}
                    primaryNodeId={entityId !== null ? String(entityId) : undefined}
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
                    onClick={() => setIncludeHistoric((h) => !h)}
                    title="Include historic relations"
                    style={{
                      marginLeft: 4,
                      padding: "3px 9px", borderRadius: 5,
                      border: includeHistoric ? "1px solid #4f9cf9" : "1px solid #2a3347",
                      background: includeHistoric ? "#0e1e3d" : "#161b27",
                      color: includeHistoric ? "#4f9cf9" : "#8892a4",
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

              {/* Entity details section */}
              <div style={{ padding: "1rem", flex: 1 }}>
                <div style={sectionLabel}>Entity details</div>

                {selectedNode ? (
                  <div>
                    <div style={{ marginBottom: 6 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700,
                        textTransform: "uppercase", letterSpacing: "0.07em",
                        padding: "2px 8px", borderRadius: 4,
                        background: selectedNode.type === "person" ? "#2a2310" : "#0e1e3d",
                        color: selectedNode.type === "person" ? "#f6c90e" : "#4f9cf9",
                      }}>
                        {selectedNode.type}
                      </span>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#e2e8f0", marginBottom: 3, lineHeight: 1.35 }}>
                      {selectedNode.label}
                    </div>
                    <div style={{ fontSize: 11, color: "#8892a4", marginBottom: 14, fontFamily: "monospace" }}>
                      {selectedNode.id}
                    </div>

                    {(primaryRelations.length > 0 || secondaryRelations.length > 0) && (
                      <>
                        {/* Primary relations — depth 1 from the searched node */}
                        {primaryRelations.length > 0 && (
                          <>
                            <div style={{ ...sectionLabel, marginBottom: 8 }}>
                              Primary&nbsp;
                              <span style={{ color: "#4b5563", fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: 11 }}>
                                ({primaryRelations.length})
                              </span>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: secondaryRelations.length > 0 ? 12 : 0 }}>
                              {primaryRelations.map(renderRelCard)}
                            </div>
                          </>
                        )}

                        {/* Secondary relations — depth > 1 from the searched node, collapsible */}
                        {secondaryRelations.length > 0 && (
                          <>
                            <button
                              onClick={() => setSecondaryOpen((o) => !o)}
                              style={{
                                display: "flex", alignItems: "center",
                                background: "none", border: "none", padding: "0 0 8px",
                                cursor: "pointer", width: "100%",
                              }}
                            >
                              <span style={{ ...sectionLabel, marginBottom: 0 }}>
                                Secondary&nbsp;
                                <span style={{ color: "#4b5563", fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: 11 }}>
                                  ({secondaryRelations.length})
                                </span>
                              </span>
                              <span style={{ marginLeft: "auto", color: "#4f9cf9", fontSize: 11 }}>
                                {secondaryOpen ? "▾" : "▸"}
                              </span>
                            </button>
                            {secondaryOpen && (
                              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                                {secondaryRelations.map(renderRelCard)}
                              </div>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "#4b5563", textAlign: "center", marginTop: 32 }}>
                    Click a node to see details
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
