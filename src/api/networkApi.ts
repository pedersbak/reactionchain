/// <reference types="vite/client" />

/**
 * Types matching the CVR adapter API response.
 * API: GET https://netvrk.nu/cvradapter/{entityId}?depth={depth}
 */

export interface CvrEntity {
  $id: string;
  /** CVR / person registry ID. */
  id: number;
  name: string;
  /** 1 = person, 0 or 2 = company */
  type: number;
}

export interface CvrRelation {
  $id: string;
  FromId: number;
  ToId: number;
  RelationType: string;
  RelationValue: string | null;
  GyldigFra: string | null;
  GyldigTil: string | null;
}

export interface CvrNetworkResponse {
  $id: string;
  entities: CvrEntity[];
  relations: CvrRelation[];
  layout: {
    $id: string;
    /** Map of entityId (string) → [x, y] in normalised [-1, 1] range. */
    Layout: Record<string, [number, number]>;
  };
}

/** Thrown when the API returns a non-OK response. Check `status` for 401 etc. */
export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

const BASE_URL = "/api/cvr";

/**
 * Fetch network data for a given CVR entity.
 * @param token - Bearer token from the auth context.
 */
export async function fetchNetwork(
  entityId: number,
  token: string,
  depth = 2,
  includeHistoric = false
): Promise<CvrNetworkResponse> {
  const res = await fetch(
    `${BASE_URL}/${entityId}?depth=${depth}&includeHistoric=${includeHistoric}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!res.ok) {
    if (res.status >= 500) {
      throw new ApiError(
        res.status,
        `virk.dk oplever problemer lige nu (fejl ${res.status}). Prøv igen om lidt.`
      );
    }
    throw new ApiError(res.status, `CVR API error ${res.status}: ${res.statusText}`);
  }

  return res.json() as Promise<CvrNetworkResponse>;
}
