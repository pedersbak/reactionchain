import { useState, useEffect, useCallback, useRef } from "react";
import type { NetworkNodeData, NetworkLinkData } from "iris-ui";
import { useAuth } from "iris-ui";
import { fetchNetwork, ApiError } from "../api/networkApi";
import { transformCvrResponse } from "./useNetworkData";

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
  /**
   * Ensure a node's direct neighbours are in the graph.
   * If the node has already been expanded this is a no-op.
   * Awaiting it lets the caller navigate only after the data is ready.
   */
  expandNode: (nodeId: string) => Promise<void>;
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

  // Refs so async callbacks always see the latest values without being recreated
  const auth = useAuth();
  const authRef = useRef(auth);
  authRef.current = auth;

  const includeHistoricRef = useRef(includeHistoric);
  includeHistoricRef.current = includeHistoric;

  const entityIdRef = useRef(entityId);
  entityIdRef.current = entityId;

  // Which node IDs have been fetched as a root (depth-1 query)
  const expandedRef = useRef(new Set<string>());

  // Incremented on every reset; lets stale async results detect they're outdated
  const sessionRef = useRef(0);

  // Merge new nodes/links into the accumulated maps, skipping duplicates
  const mergeResults = useCallback((newNodes: NetworkNodeData[], newLinks: NetworkLinkData[]) => {
    setNodeMap((prev) => {
      const next = new Map(prev);
      for (const n of newNodes) if (!next.has(n.id)) next.set(n.id, n);
      return next;
    });
    setLinkMap((prev) => {
      const next = new Map(prev);
      for (const l of newLinks) if (!next.has(l.id)) next.set(l.id, l);
      return next;
    });
  }, []);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (entityId === null) return;

    sessionRef.current += 1;
    const session = sessionRef.current;

    // Clear accumulated graph for the new entity
    expandedRef.current = new Set<string>();
    setLoading(true);
    setError(null);
    setNodeMap(new Map());
    setLinkMap(new Map());
    setGraphNodes([]);
    setGraphLinks([]);

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
        // Only the root entity counts as "expanded" — depth-1 neighbours
        // may have connections outside this graph that we haven't fetched yet.
        expandedRef.current = new Set([String(entityId)]);
        // Freeze the graph-view snapshot — stable layout coordinates only from initial fetch.
        setGraphNodes(n);
        setGraphLinks(l);
        mergeResults(n, l);
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
  const expandNode = useCallback(async (nodeId: string): Promise<void> => {
    if (expandedRef.current.has(nodeId)) return;
    if (entityIdRef.current === null) return;

    const session = sessionRef.current;
    const { tokens, refreshTokens, logout } = authRef.current;
    const token = tokens?.token;
    if (!token) return;

    setNavLoading(true);
    try {
      const data = await fetchNetwork(parseInt(nodeId, 10), token, 1, includeHistoricRef.current)
        .catch(async (err: unknown) => {
          if (err instanceof ApiError && err.status === 401) {
            const newTokens = await refreshTokens();
            if (!newTokens) { logout(); throw new Error("Session expired."); }
            return fetchNetwork(parseInt(nodeId, 10), newTokens.token, 1, includeHistoricRef.current);
          }
          throw err;
        });

      // Guard: entity changed while we were fetching
      if (sessionRef.current !== session) return;

      const { nodes: n, links: l } = transformCvrResponse(data);
      expandedRef.current = new Set([...expandedRef.current, nodeId]);
      mergeResults(n, l);
    } catch {
      // Navigation failure is non-fatal; the user can tap again
    } finally {
      if (sessionRef.current === session) setNavLoading(false);
    }
  }, [mergeResults]);

  return {
    nodes: Array.from(nodeMap.values()),
    links: Array.from(linkMap.values()),
    graphNodes,
    graphLinks,
    loading,
    navLoading,
    error,
    expandNode,
  };
}
