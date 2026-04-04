import { useState, useEffect, useCallback, useRef } from "react";
import type { NetworkNodeData, NetworkLinkData } from "iris-ui";
import { useAuth } from "iris-ui";
import { fetchNetwork, fetchLayout, ApiError } from "../api/networkApi";
import { transformCvrResponse, normalizedToCanvas, GRAPH_DIMENSIONS, PADDING } from "./useNetworkData";

export interface UseExpandableGraphResult {
  nodes: NetworkNodeData[];
  links: NetworkLinkData[];
  /** Frozen snapshot of the initial entity's graph — safe to pass to NetworkGraph (stable coordinates). */
  graphNodes: NetworkNodeData[];
  graphLinks: NetworkLinkData[];
  /** True while the initial entity load is in progress. */
  loading: boolean;
  /** True while a per-navigation depth-1 fetch is in progress. */
  navLoading: boolean;
  error: string | null;
  /** Incremented each time the layout is recomputed from the API; pass to NetworkGraph to trigger a full position reset. */
  layoutRevision: number;
  /**
   * Ensure a node's neighbours (up to `depth` hops) are in the graph.
   * If the node has already been expanded this is a no-op.
   * Awaiting it lets the caller navigate only after the data is ready.
   */
  expandNode: (nodeId: string, depth?: number) => Promise<void>;
}

export function useExpandableGraph(
  entityId: number | null,
  initialDepth: number,
  includeHistoric: boolean,
): UseExpandableGraphResult {
  const [nodeMap, setNodeMap] = useState(new Map<string, NetworkNodeData>());
  const [linkMap, setLinkMap] = useState(new Map<string, NetworkLinkData>());
  const [graphNodes, setGraphNodes] = useState<NetworkNodeData[]>([]);
  const [graphLinks, setGraphLinks] = useState<NetworkLinkData[]>([]);
  const [loading, setLoading] = useState(false);
  const [navLoading, setNavLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Incremented each time the full graph layout is recomputed.
  const [layoutRevision, setLayoutRevision] = useState(0);

  // Sync refs — always hold the latest map values so async callbacks never read stale state.
  const nodeMapRef = useRef(new Map<string, NetworkNodeData>());
  const linkMapRef = useRef(new Map<string, NetworkLinkData>());

  // Refs so async callbacks always see the latest values without being recreated
  const auth = useAuth();
  const authRef = useRef(auth);
  authRef.current = auth;

  const includeHistoricRef = useRef(includeHistoric);
  includeHistoricRef.current = includeHistoric;

  const entityIdRef = useRef(entityId);
  entityIdRef.current = entityId;

  // Tracks the maximum depth at which each node has been expanded as a root query.
  // A node is only skipped if it has already been fetched at >= the requested depth.
  const expandedRef = useRef(new Map<string, number>());

  // Incremented on every reset; lets stale async results detect they're outdated
  const sessionRef = useRef(0);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (entityId === null) return;

    sessionRef.current += 1;
    const session = sessionRef.current;

    // Clear accumulated graph for the new entity
    expandedRef.current = new Map<string, number>();
    const emptyNodeMap = new Map<string, NetworkNodeData>();
    const emptyLinkMap = new Map<string, NetworkLinkData>();
    nodeMapRef.current = emptyNodeMap;
    linkMapRef.current = emptyLinkMap;
    setLoading(true);
    setError(null);
    setNodeMap(emptyNodeMap);
    setLinkMap(emptyLinkMap);
    setGraphNodes([]);
    setGraphLinks([]);
    setLayoutRevision(0);

    const { tokens, refreshTokens, logout } = authRef.current;
    const token = tokens?.token;

    if (!token) {
      setError("Not authenticated.");
      setLoading(false);
      return;
    }

    fetchNetwork(entityId, token, initialDepth, includeHistoric)
      .catch(async (err: unknown) => {
        if (err instanceof ApiError && err.status === 401) {
          const newTokens = await refreshTokens();
          if (!newTokens) { logout(); throw new Error("Session expired. Please log in again."); }
          return fetchNetwork(entityId, newTokens.token, initialDepth, includeHistoric);
        }
        throw err;
      })
      .then((data) => {
        if (sessionRef.current !== session) return;
        const { nodes: n, links: l } = transformCvrResponse(data);
        // Mark root as expanded at initialDepth. Neighbours are not marked —
        // they may have connections we haven't fetched yet.
        expandedRef.current = new Map([[String(entityId), initialDepth]]);
        // Freeze the graph-view snapshot — stable layout coordinates only from initial fetch.
        setGraphNodes(n);
        setGraphLinks(l);
        // Sync refs and state
        const newNodeMap = new Map(n.map((node) => [node.id, node]));
        const newLinkMap = new Map(l.map((link) => [link.id, link]));
        nodeMapRef.current = newNodeMap;
        linkMapRef.current = newLinkMap;
        setNodeMap(newNodeMap);
        setLinkMap(newLinkMap);
      })
      .catch((err: unknown) => {
        if (sessionRef.current !== session) return;
        if (!(err instanceof ApiError)) {
          setError("virk.dk kan ikke nås lige nu. Tjek din forbindelse eller prøv igen om lidt.");
        } else {
          setError((err as Error).message);
        }
      })
      .finally(() => {
        if (sessionRef.current === session) setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId, initialDepth, includeHistoric, auth.tokens?.token]);

  // ── On-demand expansion ───────────────────────────────────────────────────
  const expandNode = useCallback(async (nodeId: string, depth = 1): Promise<void> => {
    if ((expandedRef.current.get(nodeId) ?? 0) >= depth) return;
    if (entityIdRef.current === null) return;

    const session = sessionRef.current;
    const { tokens, refreshTokens, logout } = authRef.current;
    const token = tokens?.token;
    if (!token) return;

    setNavLoading(true);
    try {
      const data = await fetchNetwork(parseInt(nodeId, 10), token, depth, includeHistoricRef.current)
        .catch(async (err: unknown) => {
          if (err instanceof ApiError && err.status === 401) {
            const newTokens = await refreshTokens();
            if (!newTokens) { logout(); throw new Error("Session expired."); }
            return fetchNetwork(parseInt(nodeId, 10), newTokens.token, depth, includeHistoricRef.current);
          }
          throw err;
        });

      // Guard: entity changed while we were fetching
      if (sessionRef.current !== session) return;

      const { nodes: newNodes, links: newLinks } = transformCvrResponse(data);

      // Compute merged sets from refs — always current, never stale
      const mergedNodeMap = new Map(nodeMapRef.current);
      for (const n of newNodes) if (!mergedNodeMap.has(n.id)) mergedNodeMap.set(n.id, n);
      const mergedLinkMap = new Map(linkMapRef.current);
      for (const l of newLinks) if (!mergedLinkMap.has(l.id)) mergedLinkMap.set(l.id, l);

      const allNodes = Array.from(mergedNodeMap.values());
      const allLinks = Array.from(mergedLinkMap.values());

      // ── Commit merged data immediately so the new node's connections are
      // visible in the graph right away, regardless of whether the layout
      // API call below succeeds or not.
      nodeMapRef.current = mergedNodeMap;
      linkMapRef.current = mergedLinkMap;
      setNodeMap(new Map(mergedNodeMap));
      setLinkMap(new Map(mergedLinkMap));
      expandedRef.current.set(nodeId, Math.max(expandedRef.current.get(nodeId) ?? 0, depth));

      // ── Re-layout the full accumulated graph so positions are consistent.
      // This is best-effort — if it fails we keep the already-committed data.
      try {
        const layoutResult = await fetchLayout(
          {
            entities: allNodes.map((n) => ({
              id: parseInt(n.id, 10),
              name: n.label,
              type: n.type === "person" ? 1 : 0,
            })),
            relations: allLinks.map((l) => ({
              FromId: parseInt(l.sourceId, 10),
              ToId: parseInt(l.targetId, 10),
            })),
          },
          token,
        );

        if (sessionRef.current !== session) return;

        // Apply the new layout coordinates to every accumulated node
        const laidOutNodes = allNodes.map((n) => {
          const pos = layoutResult[n.id];
          if (!pos) return n;
          return {
            ...n,
            x: normalizedToCanvas(pos[0], GRAPH_DIMENSIONS.width, PADDING),
            y: normalizedToCanvas(pos[1], GRAPH_DIMENSIONS.height, PADDING),
          };
        });

        const laidOutNodeMap = new Map(laidOutNodes.map((n) => [n.id, n]));
        nodeMapRef.current = laidOutNodeMap;
        setNodeMap(new Map(laidOutNodeMap));
        setLayoutRevision((r) => r + 1);
      } catch {
        // Layout failed — new connections are still visible at their individual-fetch positions
      }
    } catch {
      // Network fetch failure is non-fatal; the user can tap again
    } finally {
      if (sessionRef.current === session) setNavLoading(false);
    }
  }, []);

  return {
    nodes: Array.from(nodeMap.values()),
    links: Array.from(linkMap.values()),
    graphNodes,
    graphLinks,
    loading,
    navLoading,
    error,
    layoutRevision,
    expandNode,
  };
}
