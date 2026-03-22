import React, { useState, KeyboardEvent, useEffect, useRef, useMemo } from "react";
import { NetworkGraph, useDebounce } from "iris-ui";
import type { NetworkNodeData, NetworkLinkData } from "iris-ui";
import { useNetworkData, GRAPH_DIMENSIONS } from "../hooks/useNetworkData";
import { suggestCvr } from "../api/suggestApi";
import type { CvrSuggestion } from "../api/suggestApi";

const DEFAULT_DEPTH = 1;

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

type SheetState = "hidden" | "peek" | "open";

export const MobileNetworkPage: React.FC = () => {
  const [inputValue, setInputValue] = useState("");
  const [entityId, setEntityId] = useState<number | null>(null);
  const [depth, setDepth] = useState(DEFAULT_DEPTH);
  const [selectedNode, setSelectedNode] = useState<NetworkNodeData | null>(null);
  const [sheetState, setSheetState] = useState<SheetState>("hidden");
  const [secondaryOpen, setSecondaryOpen] = useState(false);

  const [suggestions, setSuggestions] = useState<CvrSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const userTypedRef = useRef(false);
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const [graphSize, setGraphSize] = useState<{ w: number; h: number }>({
    w: GRAPH_DIMENSIONS.width,
    h: GRAPH_DIMENSIONS.height,
  });

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
      if (!userTypedRef.current) { setSuggestions([]); setShowSuggestions(false); }
      return;
    }
    suggestCvr(debouncedInput).then((results) => {
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
      setActiveIndex(-1);
    });
  }, [debouncedInput]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const { nodes, links, loading, error } = useNetworkData(entityId, depth);

  useEffect(() => {
    if (loading || nodes.length === 0 || entityId === null) return;
    const primary = nodes.find((n) => n.id === String(entityId));
    if (primary) { setSelectedNode(primary); setSheetState("peek"); }
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
    setSheetState("peek");
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
          setSheetState("peek");
        }
      }}
      style={{
        padding: "10px 12px",
        borderRadius: 8,
        background: "#0d1117",
        border: "1px solid #2a3347",
        cursor: "pointer",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", marginBottom: r.labels.length > 0 ? 4 : 0 }}>
        {r.otherName}
      </div>
      {r.labels.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
          {r.labels.map((lbl, li) => (
            <span key={li} style={{
              fontSize: 11, padding: "2px 7px", borderRadius: 4,
              background: "#0e1e3d", color: "#4f9cf9", fontWeight: 600,
            }}>
              {lbl}
            </span>
          ))}
        </div>
      )}
    </div>
  );

  const PEEK_HEIGHT = 110;
  const OPEN_HEIGHT = Math.round(window.innerHeight * 0.65);
  const sheetHeight = sheetState === "hidden" ? 0 : sheetState === "peek" ? PEEK_HEIGHT : OPEN_HEIGHT;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative", overflow: "hidden" }}>

      {/* Search bar */}
      <div style={{ padding: "0.65rem 0.75rem", flexShrink: 0, zIndex: 10 }}>
        <div ref={wrapperRef} style={{ position: "relative" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => { userTypedRef.current = true; setInputValue(e.target.value); }}
              onKeyDown={handleKeyDown}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              placeholder="Search company or person…"
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

          {/* Depth stepper */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <span style={{ fontSize: 13, color: "#8892a4", fontWeight: 600 }}>Depth</span>
            <button onClick={() => setDepth((d) => Math.max(1, d - 1))} disabled={loading || depth <= 1} style={stepperBtn}>−</button>
            <span style={{ minWidth: 18, textAlign: "center", fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>{depth}</span>
            <button onClick={() => setDepth((d) => Math.min(2, d + 1))} disabled={loading || depth >= 2} style={stepperBtn}>+</button>
          </div>

          {showSuggestions && (
            <ul
              onMouseDown={(e) => e.preventDefault()}
              style={{
                position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
                margin: 0, padding: 0, listStyle: "none",
                background: "#161b27", border: "1px solid #2a3347",
                borderRadius: 8, boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
                zIndex: 50, maxHeight: "40vh", overflowY: "auto",
              }}>
              {suggestions.map((s, i) => (
                <li
                  key={s.id}
                  onClick={() => pickSuggestion(s)}
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
          margin: "0 0.75rem 0.5rem",
          padding: "10px 14px", borderRadius: 8,
          background: "rgba(185,28,28,0.15)", border: "1px solid #7f1d1d",
          color: "#fca5a5", fontSize: 13, flexShrink: 0,
        }}>
          {error}
        </div>
      )}

      {/* Graph — fills available space above the bottom sheet */}
      <div
        ref={graphContainerRef}
        style={{
          flex: 1,
          overflow: "hidden",
          position: "relative",
          marginBottom: sheetHeight,
          transition: "margin-bottom 0.3s ease",
        }}
      >
        {loading && (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(13,17,23,0.85)", fontSize: 14, color: "#8892a4", zIndex: 20,
          }}>
            Fetching network…
          </div>
        )}

        {!loading && (entityId === null || nodes.length > 0) && (() => {
          const scale = Math.min(
            graphSize.w / GRAPH_DIMENSIONS.width,
            graphSize.h / GRAPH_DIMENSIONS.height,
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
                  primaryNodeId={entityId !== null ? String(entityId) : undefined}
                />
              </div>
            </div>
          );
        })()}

        {!loading && entityId === null && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 10,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#e2e8f0" }}>No network loaded</div>
            <div style={{ fontSize: 12, color: "#8892a4", textAlign: "center", maxWidth: 220, lineHeight: 1.6 }}>
              Search for a company or person to explore their network
            </div>
          </div>
        )}

        {!loading && entityId !== null && !error && nodes.length === 0 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#4b5563", fontSize: 14 }}>
            No data
          </div>
        )}
      </div>

      {/* Bottom sheet */}
      {sheetState !== "hidden" && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0,
          height: sheetHeight,
          background: "#161b27",
          borderTop: "1px solid #1e2638",
          borderRadius: "16px 16px 0 0",
          transition: "height 0.3s ease",
          zIndex: 100,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 -4px 24px rgba(0,0,0,0.5)",
        }}>

          {/* Handle + entity summary header — tappable to expand/collapse */}
          <div
            onClick={() => setSheetState((s) => s === "peek" ? "open" : "peek")}
            style={{
              flexShrink: 0,
              padding: "14px 16px 10px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              position: "relative",
            }}
          >
            {/* Drag handle pill */}
            <div style={{
              position: "absolute", top: 6, left: "50%",
              transform: "translateX(-50%)",
              width: 36, height: 4, borderRadius: 2,
              background: "#2a3347",
            }} />

            {selectedNode && (
              <>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>{selectedNode.label}</div>
                  <div style={{ fontSize: 11, color: "#8892a4", marginTop: 2 }}>
                    {primaryRelations.length} primary · {secondaryRelations.length} secondary
                  </div>
                </div>
                <span style={{ color: "#4f9cf9", fontSize: 16 }}>
                  {sheetState === "peek" ? "▴" : "▾"}
                </span>
              </>
            )}
          </div>

          {/* Scrollable content — only rendered when fully open */}
          {sheetState === "open" && selectedNode && (
            <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 32px" }}>

              {/* Entity type + CVR badge */}
              <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center" }}>
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: "0.07em",
                  padding: "3px 9px", borderRadius: 4,
                  background: selectedNode.type === "person" ? "#2a2310" : "#0e1e3d",
                  color: selectedNode.type === "person" ? "#f6c90e" : "#4f9cf9",
                }}>
                  {selectedNode.type}
                </span>
                <span style={{ fontSize: 12, color: "#8892a4", fontFamily: "monospace" }}>
                  {selectedNode.id}
                </span>
              </div>

              {/* Primary relations */}
              {primaryRelations.length > 0 && (
                <>
                  <div style={sectionLabel}>
                    Primary&nbsp;
                    <span style={{ color: "#4b5563", fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: 11 }}>
                      ({primaryRelations.length})
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                    {primaryRelations.map(renderRelCard)}
                  </div>
                </>
              )}

              {/* Secondary relations — collapsible */}
              {secondaryRelations.length > 0 && (
                <>
                  <button
                    onClick={() => setSecondaryOpen((o) => !o)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      background: "none", border: "none", padding: "0 0 10px",
                      cursor: "pointer", width: "100%",
                    }}
                  >
                    <span style={{ ...sectionLabel, marginBottom: 0 }}>
                      Secondary&nbsp;
                      <span style={{ color: "#4b5563", fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: 11 }}>
                        ({secondaryRelations.length})
                      </span>
                    </span>
                    <span style={{ color: "#4f9cf9", fontSize: 13 }}>{secondaryOpen ? "▾" : "▸"}</span>
                  </button>
                  {secondaryOpen && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {secondaryRelations.map(renderRelCard)}
                    </div>
                  )}
                </>
              )}

            </div>
          )}
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
  width: 28,
  height: 28,
  borderRadius: 6,
  border: "1px solid #2a3347",
  background: "#161b27",
  cursor: "pointer",
  fontSize: 17,
  lineHeight: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 700,
  color: "#e2e8f0",
  padding: 0,
};
