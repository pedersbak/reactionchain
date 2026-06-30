import React, { useState, KeyboardEvent, useEffect, useRef, useMemo } from "react";
import { NetworkGraph, useDebounce, useAuth, ReportModal, AiReportButton, MobileCardView } from "iris-ui";
import type { NetworkNodeData, NetworkLinkData } from "iris-ui";
import { useExpandableGraph } from "../hooks/useExpandableGraph";
import { GRAPH_DIMENSIONS } from "../hooks/useNetworkData";
import { suggestCvr } from "../api/suggestApi";
import type { CvrSuggestion } from "../api/suggestApi";
import { fetchAiReport } from "../api/reportApi";

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

const KpiCard: React.FC<{ label: string; value: string | number; sub: string; icon: React.ReactNode }> = ({ label, value, sub, icon }) => (
  <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px", boxShadow: "var(--shadow)", display: "flex", flexDirection: "column", gap: 5 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-secondary)", letterSpacing: ".06em", textTransform: "uppercase" as const }}>
        {label}
      </span>
      <div style={{ width: 26, height: 26, borderRadius: 6, background: "var(--accent-light)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)", flexShrink: 0 }}>
        {icon}
      </div>
    </div>
    <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>
      {value}
    </div>
    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{sub}</div>
  </div>
);

const IconNodes = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="3"/><circle cx="4" cy="6" r="2"/><circle cx="20" cy="6" r="2"/>
    <circle cx="4" cy="18" r="2"/><circle cx="20" cy="18" r="2"/>
    <line x1="6" y1="7" x2="10" y2="11"/><line x1="18" y1="7" x2="14" y2="11"/>
    <line x1="6" y1="17" x2="10" y2="13"/><line x1="18" y1="17" x2="14" y2="13"/>
  </svg>
);
const IconLinks = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>
);
const IconPerson = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
);
const IconCompany = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="7" width="20" height="14" rx="1"/>
    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
  </svg>
);
const IconBar = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
  </svg>
);
const IconLayers = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="12 2 2 7 12 12 22 7 12 2"/>
    <polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>
  </svg>
);

export const NetworkTestPage: React.FC = () => {
  const [inputValue, setInputValue]           = useState("");
  const [entityId, setEntityId]               = useState<number | null>(null);
  const [depth, setDepth]                     = useState(DEFAULT_DEPTH);
  const [includeHistoric, setIncludeHistoric] = useState(false);
  const [reportMarkdown, setReportMarkdown]   = useState<string | null>(null);
  const [reportTitle, setReportTitle]         = useState("");
  const [reportLoading, setReportLoading]     = useState(false);
  const [reportError, setReportError]         = useState<string | null>(null);
  const [cardHistory, setCardHistory]         = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen]         = useState(true);
  const currentCardId                         = cardHistory[cardHistory.length - 1] ?? null;
  const { tokens } = useAuth();
  const [suggestions, setSuggestions]         = useState<CvrSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex]         = useState(-1);
  const userTypedRef         = useRef(false);
  const historyInitEntityRef = useRef<number | null>(null);
  const graphContainerRef    = useRef<HTMLDivElement>(null);
  const [graphSize, setGraphSize] = useState<{ w: number; h: number }>({ w: GRAPH_DIMENSIONS.width, h: GRAPH_DIMENSIONS.height });

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

  const { nodes, links, loading, navLoading, error, layoutRevision, expandNode } =
    useExpandableGraph(entityId, depth, includeHistoric);

  useEffect(() => {
    if (entityId !== null && !loading && nodes.length > 0 && historyInitEntityRef.current !== entityId) {
      historyInitEntityRef.current = entityId;
      setCardHistory([String(entityId)]);
      setReportError(null);
    }
  }, [entityId, loading, nodes.length]);

  const { graphNodes, graphLinks } = useMemo(() => {
    if (!currentCardId || nodes.length === 0) return { graphNodes: nodes, graphLinks: links };
    const visibleNodeIds = new Set<string>();
    const visibleLinkIds = new Set<string>();
    cardHistory.forEach((id) => visibleNodeIds.add(id));
    for (let i = 0; i < cardHistory.length - 1; i++) {
      const a = cardHistory[i], b = cardHistory[i + 1];
      const pathLink = links.find((l) => (l.sourceId === a && l.targetId === b) || (l.sourceId === b && l.targetId === a));
      if (pathLink) visibleLinkIds.add(pathLink.id);
    }
    let frontier = new Set<string>([currentCardId]);
    visibleNodeIds.add(currentCardId);
    for (let hop = 0; hop < depth; hop++) {
      const nextFrontier = new Set<string>();
      for (const l of links) {
        if (!frontier.has(l.sourceId) && !frontier.has(l.targetId)) continue;
        visibleLinkIds.add(l.id);
        [l.sourceId, l.targetId].forEach((id) => {
          if (!visibleNodeIds.has(id)) { visibleNodeIds.add(id); nextFrontier.add(id); }
        });
      }
      frontier = nextFrontier;
      if (frontier.size === 0) break;
    }
    return { graphNodes: nodes.filter((n) => visibleNodeIds.has(n.id)), graphLinks: links.filter((l) => visibleLinkIds.has(l.id)) };
  }, [currentCardId, cardHistory, depth, nodes, links]);

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

  const handleNodeClick = async (node: NetworkNodeData) => {
    setInputValue(node.id);
    await expandNode(node.id, 1);
    setCardHistory((h) => [...h, node.id]);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") {
      if (activeIndex >= 0 && suggestions[activeIndex]) pickSuggestion(suggestions[activeIndex]);
      else handleLoad();
    } else if (e.key === "Escape") { setShowSuggestions(false); }
  };

  const currentNode: NetworkNodeData | null =
    currentCardId ? (nodes.find((n) => n.id === currentCardId) ?? null) : null;

  const personCount   = graphNodes.filter((n) => n.type === "person").length;
  const companyCount  = graphNodes.filter((n) => n.type === "company").length;
  const avgRelations  = graphNodes.length > 0 ? (graphLinks.length / graphNodes.length).toFixed(1) : "—";
  const historicCount = graphLinks.filter((l) => l.strokeDasharray).length;

  const handleReset = () => {
    setEntityId(null);
    setInputValue("");
    setCardHistory([]);
    setSuggestions([]);
    setShowSuggestions(false);
    setReportMarkdown(null);
    setReportError(null);
    historyInitEntityRef.current = null;
  };

  return (
    <>
      {/* SIDEBAR WRAPPER — collapsible */}
      <div style={{ display: "flex", flexShrink: 0, position: "relative" }}>
        {/* Sidebar panel */}
        <div style={{ width: sidebarOpen ? 248 : 0, overflow: "hidden", transition: "width 0.25s ease", flexShrink: 0 }}>
          <aside style={{ width: 248, height: "100%", background: "var(--bg-sidebar)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px 12px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", letterSpacing: ".02em" }}>Explorer</span>
          {entityId !== null && (
            <span onClick={handleReset} style={{ fontSize: 11, color: "var(--accent)", fontWeight: 500, cursor: "pointer" }}>Reset</span>
          )}
        </div>

        <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Search */}
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <div style={filterLabel}>Search</div>
            <div style={{ position: "relative" }}>
              <input
                type="text"
                value={inputValue}
                onChange={(e) => { userTypedRef.current = true; setInputValue(e.target.value); }}
                onKeyDown={handleKeyDown}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 300)}
                placeholder="Name or CVR…"
                style={{ width: "100%", padding: "7px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 12, outline: "none", fontFamily: "inherit" }}
              />
              {showSuggestions && (
                <ul style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, margin: 0, padding: 0, listStyle: "none", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.15)", zIndex: 50, maxHeight: "38vh", overflowY: "auto" }}>
                  {suggestions.map((s, i) => (
                    <li key={s.id}
                      onMouseDown={(e) => { e.preventDefault(); pickSuggestion(s); }}
                      onTouchStart={(e) => { e.preventDefault(); pickSuggestion(s); }}
                      onMouseEnter={() => setActiveIndex(i)}
                      style={{ padding: "8px 12px", cursor: "pointer", background: i === activeIndex ? "var(--accent-light)" : "transparent", borderBottom: i < suggestions.length - 1 ? "1px solid var(--border)" : "none" }}>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 12 }}>{s.name}</div>
                      <div style={{ color: "var(--text-muted)", fontSize: 11 }}>{s.id}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Depth */}
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <div style={filterLabel}>Network Depth</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button onClick={() => setDepth((d) => Math.max(1, d - 1))} disabled={loading || depth <= 1} style={stepperBtn}>&#8722;</button>
              <span style={{ minWidth: 20, textAlign: "center", fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{depth}</span>
              <button onClick={() => setDepth((d) => Math.min(2, d + 1))} disabled={loading || depth >= 2} style={stepperBtn}>+</button>
            </div>
          </div>

          {/* Options */}
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <div style={filterLabel}>Options</div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-primary)", cursor: "pointer" }}>
              <input type="checkbox" checked={includeHistoric}
                onChange={() => {
                  if (currentCardId && currentCardId !== String(entityId)) {
                    const focusedId = parseInt(currentCardId, 10);
                    if (!isNaN(focusedId)) { setEntityId(focusedId); setInputValue(currentCardId); }
                  }
                  setIncludeHistoric((h) => !h);
                }}
                style={{ accentColor: "var(--accent)", width: 14, height: 14 }}
              />
              Include historic relations
            </label>
          </div>

          {/* Load button */}
          <button onClick={handleLoad} disabled={loading}
            style={{ width: "100%", padding: "9px", borderRadius: 8, background: loading ? "var(--accent-light)" : "var(--accent-btn)", color: loading ? "var(--accent)" : "var(--accent-btn-text)", border: "none", fontSize: 13, fontWeight: 600, cursor: loading ? "default" : "pointer", fontFamily: "inherit", letterSpacing: ".01em" }}>
            {loading ? "Loading…" : "Load Network"}
          </button>
        </div>

        {/* Card exploration section */}
        {currentCardId && (
          <>
            <div style={{ borderTop: "1px solid var(--border)" }} />
            {cardHistory.length > 1 && (
              <div style={{ padding: "8px 16px 0", display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                {cardHistory.map((id, i) => {
                  const n = nodes.find((nd) => nd.id === id);
                  const isLast = i === cardHistory.length - 1;
                  return (
                    <React.Fragment key={id + "-" + i}>
                      <button onClick={() => !isLast && setCardHistory(cardHistory.slice(0, i + 1))}
                        style={{ background: "none", border: "none", padding: "1px 3px", fontSize: 10, color: isLast ? "var(--text-primary)" : "var(--accent)", cursor: isLast ? "default" : "pointer", fontWeight: isLast ? 700 : 400, maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {n?.label ?? id}
                      </button>
                      {!isLast && <span style={{ color: "var(--text-muted)", fontSize: 10 }}>&#8250;</span>}
                    </React.Fragment>
                  );
                })}
              </div>
            )}
            {cardHistory.length > 1 && (
              <button onClick={() => setCardHistory((h) => h.slice(0, -1))}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 16px", background: "none", border: "none", borderBottom: "1px solid var(--border)", color: "var(--accent)", fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "left", width: "100%", fontFamily: "inherit" }}>
                &#8592; Back
              </button>
            )}
            {navLoading && (
              <div style={{ padding: "5px 16px", background: "var(--accent-light)", borderBottom: "1px solid var(--border)", fontSize: 11, color: "var(--accent)" }}>
                Loading relations…
              </div>
            )}
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
              />
            </div>
          </>
        )}
          </aside>
        </div>

        {/* Collapse / expand tab */}
        <button
          onClick={() => setSidebarOpen((o) => !o)}
          title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          style={{
            position: "absolute",
            right: -16,
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 30,
            width: 16,
            height: 52,
            background: "var(--bg-sidebar)",
            border: "1px solid var(--border)",
            borderLeft: "none",
            borderRadius: "0 6px 6px 0",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            color: "var(--text-muted)",
            fontSize: 12,
            boxShadow: "2px 0 6px rgba(0,0,0,0.15)",
          }}
        >
          {sidebarOpen ? "‹" : "›"}
        </button>
      </div>

      {/* MAIN */}
      <main style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 18, background: "var(--bg-page)", minWidth: 0 }}>
        {/* Page header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)" }}>
              {entityId !== null && currentNode ? currentNode.label : "Network Graph"}
            </div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 3 }}>
              {entityId !== null ? "Explore connections and ownership relations" : "Search for a company or person to explore their network"}
            </div>
          </div>
          {currentNode && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
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
                    setReportError("Report could not be fetched. Please try again.");
                  } finally {
                    setReportLoading(false);
                  }
                }}
              />
            </div>
          )}
        </div>

        {/* Error banner */}
        {(error || reportError) && (
          <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(185,28,28,0.12)", border: "1px solid rgba(185,28,28,0.3)", color: "#fca5a5", fontSize: 13, flexShrink: 0 }}>
            {error || reportError}
          </div>
        )}

        {/* KPI metrics grid */}
        {graphNodes.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, flexShrink: 0 }}>
            <KpiCard label="Entities"           value={graphNodes.length}  sub="visible nodes"         icon={<IconNodes />} />
            <KpiCard label="Relations"          value={graphLinks.length}  sub="visible connections"   icon={<IconLinks />} />
            <KpiCard label="Persons"            value={personCount}        sub="in view"               icon={<IconPerson />} />
            <KpiCard label="Companies"          value={companyCount}       sub="in view"               icon={<IconCompany />} />
            <KpiCard label="Avg. Connections"   value={avgRelations}       sub="per entity"            icon={<IconBar />} />
            <KpiCard label="Historic Relations" value={historicCount} sub={historicCount > 0 ? "shown as dashed lines" : includeHistoric ? "none found" : "enable in sidebar"} icon={<IconLayers />} />
          </div>
        )}

        {/* Network graph card */}
        <div ref={graphContainerRef} style={{ flex: 1, minHeight: nodes.length > 0 ? 340 : 420, border: "1px solid var(--border)", borderRadius: 12, background: "var(--bg-card)", boxShadow: "0 2px 12px rgba(0,0,0,0.25)", overflow: "hidden", position: "relative" }}>
          {loading && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-card)", fontSize: 14, color: "var(--text-secondary)", zIndex: 20 }}>
              Fetching network data…
            </div>
          )}
          {!loading && (entityId === null || nodes.length > 0) && (() => {
            const scale = Math.min(graphSize.w / GRAPH_DIMENSIONS.width, graphSize.h / GRAPH_DIMENSIONS.height);
            return (
              <div style={entityId === null ? { opacity: 0.12, filter: "grayscale(1) blur(1.5px)", pointerEvents: "none" } : {}}>
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
          {!loading && entityId === null && (
            <div style={{ position: "absolute", inset: 0, zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>No network loaded</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", textAlign: "center", maxWidth: 240, lineHeight: 1.6 }}>
                Search for a company or person in the sidebar to explore their network
              </div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4, letterSpacing: "0.05em", textTransform: "uppercase", fontWeight: 700 }}>
                — preview only —
              </div>
            </div>
          )}
          {!loading && entityId !== null && !error && nodes.length === 0 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)", fontSize: 14 }}>
              No data found
            </div>
          )}
        </div>
      </main>

      {reportMarkdown && (
        <ReportModal title={reportTitle} markdown={reportMarkdown} onClose={() => setReportMarkdown(null)} />
      )}
    </>
  );
};

const filterLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "var(--text-secondary)",
  letterSpacing: ".07em",
  textTransform: "uppercase",
};

const stepperBtn: React.CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 5,
  border: "1px solid var(--border)",
  background: "var(--bg-card)",
  cursor: "pointer",
  fontSize: 15,
  lineHeight: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 700,
  color: "var(--text-primary)",
  padding: 0,
  flexShrink: 0,
};
