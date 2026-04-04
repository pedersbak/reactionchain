import { useState, useEffect, useRef } from "react";
import type { NetworkNodeData, NetworkLinkData, RelationEntry } from "iris-ui";
import { useAuth } from "iris-ui";
import { fetchNetwork, ApiError } from "../api/networkApi";
import type { CvrNetworkResponse } from "../api/networkApi";

/** Fixed canvas size used both for layout mapping and for NetworkGraph dimensions. */
export const GRAPH_DIMENSIONS = { width: 1650, height: 1080 } as const;

export const PADDING = 90; // px inset so no node touches the edge
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
export function normalizedToCanvas(
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
  // A link is "historic" when ALL its relations have a past GyldigTil.
  const linkMap = new Map<string, NetworkLinkData & { _hasCurrent: boolean; _relations: RelationEntry[] }>();

  const now = new Date();

  for (const rel of data.relations) {
    // Normalise to an undirected key so A→B and B→A merge into the same entry.
    const [lo, hi] = rel.FromId < rel.ToId
      ? [rel.FromId, rel.ToId]
      : [rel.ToId, rel.FromId];
    const key = `${lo}<->${hi}`;
    const existing = linkMap.get(key);
    const isFunktion = rel.RelationType === "FUNKTION" && rel.RelationValue;
    const isCurrent = !rel.GyldigTil || new Date(rel.GyldigTil) > now;

    if (!existing) {
      linkMap.set(key, {
        id: key,
        sourceId: String(rel.FromId),
        targetId: String(rel.ToId),
        labels: isFunktion ? [rel.RelationValue!] : [],
        color: "#c5cdd6",
        strokeWidth: 1.5,
        _hasCurrent: isCurrent,
        _relations: isFunktion
          ? [{ label: rel.RelationValue!, from: rel.GyldigFra, to: rel.GyldigTil }]
          : [],
      });
    } else {
      if (isFunktion) {
        // Always add as a separate entry (dates may differ even for the same label)
        existing._relations.push({ label: rel.RelationValue!, from: rel.GyldigFra, to: rel.GyldigTil });
        // Keep labels[] as unique display strings for the edge pill
        if (!existing.labels?.includes(rel.RelationValue!)) {
          existing.labels = [...(existing.labels ?? []), rel.RelationValue!];
        }
      }
      if (isCurrent) existing._hasCurrent = true;
    }
  }

  // Apply historic styling to links where no relation is currently active.
  const links: NetworkLinkData[] = Array.from(linkMap.values()).map(({ _hasCurrent, _relations, ...link }) => {
    const base = { ...link, relations: _relations };
    if (!_hasCurrent) {
      return { ...base, color: "#7c6f3e", strokeDasharray: "5 4", strokeWidth: 1.5 };
    }
    return base;
  });

  return { nodes, links };
}

export interface UseNetworkDataResult {
  nodes: NetworkNodeData[];
  links: NetworkLinkData[];
  loading: boolean;
  error: string | null;
}

export function useNetworkData(
  entityId: number | null,
  depth = 2,
  includeHistoric = false,
  reloadKey = 0
): UseNetworkDataResult {
  const [nodes, setNodes] = useState<NetworkNodeData[]>([]);
  const [links, setLinks] = useState<NetworkLinkData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const auth = useAuth();
  // Keep a ref so the async callbacks inside useEffect always see the latest auth state.
  const authRef = useRef(auth);
  authRef.current = auth;

  useEffect(() => {
    if (entityId === null) return;

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

    fetchNetwork(entityId, token, depth, includeHistoric)
      .catch(async (err: unknown) => {
        // On 401, try to refresh and retry once
        if (err instanceof ApiError && err.status === 401) {
          const newTokens = await refreshTokens();
          if (!newTokens) {
            logout();
            throw new Error("Session expired. Please log in again.");
          }
          return fetchNetwork(entityId, newTokens.token, depth, includeHistoric);
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
          // Network-level failure (DNS, timeout, etc.) — virk.dk is unreachable
          if (!(err instanceof ApiError)) {
            setError("virk.dk kan ikke nås lige nu. Tjek din forbindelse eller prøv igen om lidt.");
          } else {
            setError(err.message);
          }
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
  }, [entityId, depth, includeHistoric, reloadKey, auth.tokens?.token]);

  return { nodes, links, loading, error };
}
