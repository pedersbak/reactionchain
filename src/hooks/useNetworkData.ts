import { useState, useEffect, useRef } from "react";
import type { NetworkNodeData, NetworkLinkData } from "iris-ui";
import { useAuth } from "iris-ui";
import { fetchNetwork, ApiError } from "../api/networkApi";
import type { CvrNetworkResponse } from "../api/networkApi";

/** Fixed canvas size used both for layout mapping and for NetworkGraph dimensions. */
export const GRAPH_DIMENSIONS = { width: 1650, height: 1080 } as const;

const PADDING = 90; // px inset so no node touches the edge
const NODE_SIZE = 48; // must match iris-ui NODE_SIZE

function mapEntityType(type: number, id: number): "person" | "company" {
  if (type === 1) return "person";
  if (type === 2) return "company";
  // type 0 is used for both — Danish P-numbers (persons) start at 4 000 000 000
  return id >= 4_000_000_000 ? "person" : "company";
}

/**
 * Convert a normalised layout coordinate [-1, 1] to a canvas pixel position.
 * The result is the node's top-left corner so the icon circle is centred on
 * the original coordinate.
 */
function normalizedToCanvas(
  v: number,
  canvasSize: number,
  padding: number
): number {
  const usable = canvasSize - padding * 2;
  return Math.round(((v + 1) / 2) * usable + padding - NODE_SIZE / 2);
}

export function transformCvrResponse(data: CvrNetworkResponse): {
  nodes: NetworkNodeData[];
  links: NetworkLinkData[];
} {
  const layout = data.layout?.Layout ?? {};

  // Build nodes
  const nodes: NetworkNodeData[] = data.entities.map((entity) => {
    const pos = layout[String(entity.id)];
    const x = pos
      ? normalizedToCanvas(pos[0], GRAPH_DIMENSIONS.width, PADDING)
      : PADDING;
    const y = pos
      ? normalizedToCanvas(pos[1], GRAPH_DIMENSIONS.height, PADDING)
      : PADDING;

    return {
      id: String(entity.id),
      label: entity.name,
      type: mapEntityType(entity.type, entity.id),
      x,
      y,
    };
  });

  // Deduplicate relations → one link per unique (FromId, ToId) pair.
  // Collect all FUNKTION RelationValues as the labels array.
  const linkMap = new Map<string, NetworkLinkData>();

  for (const rel of data.relations) {
    const key = `${rel.FromId}->${rel.ToId}`;
    const existing = linkMap.get(key);
    const isFunktion = rel.RelationType === "FUNKTION" && rel.RelationValue;

    if (!existing) {
      linkMap.set(key, {
        id: key,
        sourceId: String(rel.FromId),
        targetId: String(rel.ToId),
        labels: isFunktion ? [rel.RelationValue!] : [],
        color: "#c5cdd6",
        strokeWidth: 1.5,
      });
    } else if (isFunktion && !existing.labels?.includes(rel.RelationValue!)) {
      linkMap.set(key, {
        ...existing,
        labels: [...(existing.labels ?? []), rel.RelationValue!],
      });
    }
  }

  return { nodes, links: Array.from(linkMap.values()) };
}

export interface UseNetworkDataResult {
  nodes: NetworkNodeData[];
  links: NetworkLinkData[];
  loading: boolean;
  error: string | null;
}

export function useNetworkData(
  entityId: number,
  depth = 2
): UseNetworkDataResult {
  const [nodes, setNodes] = useState<NetworkNodeData[]>([]);
  const [links, setLinks] = useState<NetworkLinkData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const auth = useAuth();
  // Keep a ref so the async callbacks inside useEffect always see the latest auth state.
  const authRef = useRef(auth);
  authRef.current = auth;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNodes([]);
    setLinks([]);

    const { tokens, refreshTokens, logout } = authRef.current;
    const token = tokens?.token;

    if (!token) {
      if (!cancelled) {
        setError("Not authenticated.");
        setLoading(false);
      }
      return;
    }

    fetchNetwork(entityId, token, depth)
      .catch(async (err: unknown) => {
        // On 401, try to refresh and retry once
        if (err instanceof ApiError && err.status === 401) {
          const newTokens = await refreshTokens();
          if (!newTokens) {
            logout();
            throw new Error("Session expired. Please log in again.");
          }
          return fetchNetwork(entityId, newTokens.token, depth);
        }
        throw err;
      })
      .then((data) => {
        if (!cancelled) {
          const { nodes: n, links: l } = transformCvrResponse(data);
          setNodes(n);
          setLinks(l);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  // Re-run when the token changes (e.g. user just logged in or token was refreshed).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId, depth, auth.tokens?.token]);

  return { nodes, links, loading, error };
}
