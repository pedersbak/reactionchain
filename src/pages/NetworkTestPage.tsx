import React, { useState, KeyboardEvent, useEffect, useRef } from "react";
import { NetworkGraph, useDebounce } from "iris-ui";
import type { NetworkNodeData } from "iris-ui";
import { useNetworkData, GRAPH_DIMENSIONS } from "../hooks/useNetworkData";
import { suggestCvr } from "../api/suggestApi";
import type { CvrSuggestion } from "../api/suggestApi";

const DEFAULT_CVR = 33497431;
const DEFAULT_DEPTH = 2;
const PANEL_WIDTH = 308;

export const NetworkTestPage: React.FC = () => {
  const [inputValue, setInputValue] = useState(String(DEFAULT_CVR));
  const [entityId, setEntityId] = useState(DEFAULT_CVR);
  const [depth, setDepth] = useState(DEFAULT_DEPTH);
  const [panelOpen, setPanelOpen] = useState(true);
  const [selectedNode, setSelectedNode] = useState<NetworkNodeData | null>(null);

  const [suggestions, setSuggestions] = useState<CvrSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const userTypedRef = useRef(false);

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

  // Auto-select the searched entity once nodes are loaded.
  useEffect(() => {
    if (loading || nodes.length === 0) return;
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

  const selectedNodeRelations = selectedNode
    ? links
        .filter((l) => l.sourceId === selectedNode.id || l.targetId === selectedNode.id)
        .map((l) => {
          const otherId = l.sourceId === selectedNode.id ? l.targetId : l.sourceId;
          const otherNode = nodes.find((n) => n.id === otherId);
          return {
            id: l.id,
            otherId,
            otherName: otherNode?.label ?? otherId,
            otherType: otherNode?.type ?? "unknown",
            labels: l.labels ?? (l.label ? [l.label] : []),
          };
        })
    : [];

  return (
    <div style={{ display: "flex", flex: 1, overflow: "auto", padding: "1rem", flexDirection: "column" }}>

      {error && (
        <div style={{
          padding: "10px 14px", borderRadius: 8,
          background: "#fef2f2", border: "1px solid #fca5a5",
          color: "#b91c1c", fontSize: 13, marginBottom: "0.75rem",
        }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "stretch", position: "relative" }}>

        {/* Graph canvas card */}
        <div style={{
          flex: 1,
          border: "1px solid #e0e3e8", borderRadius: 12,
          background: "#fafbfc", boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
          overflow: "hidden", position: "relative", minHeight: 200,
        }}>
          {loading && (
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(250,251,252,0.85)", fontSize: 14, color: "#666", zIndex: 20,
            }}>
              Fetching network data…
            </div>
          )}
          {!loading && !error && nodes.length === 0 && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              height: 200, color: "#aaa", fontSize: 14,
            }}>
              No data
            </div>
          )}
          {nodes.length > 0 && (
            <NetworkGraph
              nodes={nodes}
              links={links}
              width={GRAPH_DIMENSIONS.width}
              height={GRAPH_DIMENSIONS.height}
              onNodeClick={handleNodeClick}
              primaryNodeId={String(entityId)}
            />
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
            background: "#fff",
            border: "1px solid #e0e3e8",
            borderRight: "none",
            borderRadius: "6px 0 0 6px",
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 0, color: "#888", fontSize: 13,
            boxShadow: "-2px 0 6px rgba(0,0,0,0.07)",
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
            border: "1px solid #e0e3e8",
            borderRadius: 12,
            background: "#fff",
            boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}>
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>

              {/* Search section */}
              <div style={{ padding: "1rem 1rem 0" }}>
                <div style={sectionLabel}>Search</div>

                <div ref={wrapperRef} style={{ position: "relative", marginBottom: 8 }}>
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => { userTypedRef.current = true; setInputValue(e.target.value); }}
                    onKeyDown={handleKeyDown}
                    onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                    placeholder="Name or CVR…"
                    style={{
                      padding: "7px 11px", borderRadius: 7,
                      border: "1px solid #d0d5dd", fontSize: 13,
                      width: "100%", outline: "none", boxSizing: "border-box",
                    }}
                  />
                  {showSuggestions && (
                    <ul style={{
                      position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
                      margin: 0, padding: 0, listStyle: "none",
                      background: "#fff", border: "1px solid #d0d5dd",
                      borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
                      zIndex: 50, maxHeight: 220, overflowY: "auto",
                    }}>
                      {suggestions.map((s, i) => (
                        <li
                          key={s.id}
                          onMouseDown={() => pickSuggestion(s)}
                          onMouseEnter={() => setActiveIndex(i)}
                          style={{
                            padding: "8px 12px", cursor: "pointer",
                            background: i === activeIndex ? "#f0f4ff" : "transparent",
                            borderBottom: i < suggestions.length - 1 ? "1px solid #f0f0f0" : "none",
                          }}
                        >
                          <div style={{ fontWeight: 600, color: "#1a1a1a", fontSize: 12 }}>{s.name}</div>
                          <div style={{ color: "#999", fontSize: 11 }}>{s.id}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: "1rem" }}>
                  <span style={{ fontSize: 12, color: "#555", fontWeight: 600 }}>Depth</span>
                  <button onClick={() => setDepth((d) => Math.max(1, d - 1))} disabled={loading || depth <= 1} style={stepperBtn}>−</button>
                  <span style={{ minWidth: 16, textAlign: "center", fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>{depth}</span>
                  <button onClick={() => setDepth((d) => Math.min(2, d + 1))} disabled={loading || depth >= 2} style={stepperBtn}>+</button>
                  <button
                    onClick={handleLoad}
                    disabled={loading}
                    style={{
                      marginLeft: "auto", padding: "6px 16px", borderRadius: 7,
                      background: loading ? "#a0b4f0" : "#4285f4",
                      color: "#fff", border: "none",
                      cursor: loading ? "default" : "pointer",
                      fontSize: 12, fontWeight: 600,
                    }}
                  >
                    {loading ? "…" : "Load"}
                  </button>
                </div>
              </div>

              <div style={{ borderTop: "1px solid #f0f0f0", margin: "0 1rem" }} />

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
                        background: selectedNode.type === "person" ? "#e8f0fe" : "#e6f4ea",
                        color: selectedNode.type === "person" ? "#4285f4" : "#34a853",
                      }}>
                        {selectedNode.type}
                      </span>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1a1a", marginBottom: 3, lineHeight: 1.35 }}>
                      {selectedNode.label}
                    </div>
                    <div style={{ fontSize: 11, color: "#999", marginBottom: 14, fontFamily: "monospace" }}>
                      {selectedNode.id}
                    </div>

                    {selectedNodeRelations.length > 0 && (
                      <>
                        <div style={{ ...sectionLabel, marginBottom: 8 }}>
                          Relations&nbsp;
                          <span style={{ color: "#bbb", fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: 11 }}>
                            ({selectedNodeRelations.length})
                          </span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                          {selectedNodeRelations.map((r) => (
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
                              onMouseEnter={(e) => (e.currentTarget.style.background = "#f0f4ff")}
                              onMouseLeave={(e) => (e.currentTarget.style.background = "#f8f9fa")}
                              style={{
                                padding: "7px 10px", borderRadius: 7,
                                background: "#f8f9fa", border: "1px solid #e8eaed",
                                cursor: "pointer",
                              }}
                            >
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a", marginBottom: r.labels.length > 0 ? 4 : 0 }}>
                                {r.otherName}
                              </div>
                              {r.labels.length > 0 && (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                                  {r.labels.map((lbl, li) => (
                                    <span key={li} style={{
                                      fontSize: 10, padding: "1px 6px", borderRadius: 3,
                                      background: "#e8f0fe", color: "#4285f4", fontWeight: 600,
                                    }}>
                                      {lbl}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "#ccc", textAlign: "center", marginTop: 32 }}>
                    Click a node to see details
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>

      </div>

      {!loading && nodes.length > 0 && (
        <div style={{ marginTop: "0.6rem", display: "flex", gap: "1rem", fontSize: "0.78rem", color: "#888" }}>
          <span><strong style={{ color: "#444" }}>{nodes.length}</strong> entities</span>
          <span><strong style={{ color: "#444" }}>{links.length}</strong> relations</span>
          <span><strong style={{ color: "#444" }}>{nodes.filter((n) => n.type === "person").length}</strong> persons</span>
          <span><strong style={{ color: "#444" }}>{nodes.filter((n) => n.type === "company").length}</strong> companies</span>
        </div>
      )}
    </div>
  );
};

const sectionLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "#aaa",
  textTransform: "uppercase",
  letterSpacing: "0.07em",
  marginBottom: 8,
};

const stepperBtn: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 5,
  border: "1px solid #d0d5dd",
  background: "#fff",
  cursor: "pointer",
  fontSize: 15,
  lineHeight: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 700,
  color: "#444",
  padding: 0,
};
