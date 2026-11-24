/**
 * Types du module de dimensionnement Rackula ↔ RackPlanner.
 *
 * Toutes les données métier sont stockées dans les `custom_fields` déjà
 * supportés par Rackula (clé préfixée `dim.`). Aucune migration de schéma
 * n'est nécessaire : un layout Rackula standard reste valide.
 */
import type { DeviceType, PlacedDevice } from "$lib/types";

export interface DimensioningSettings {
  /** Hauteur d'un U en mm */
  uMm: number;
  /** Boucle de service à chaque extrémité (mm) */
  serviceLoopMm: number;
  /** Cheminement latéral dans la baie (mm) */
  horizontalMm: number;
  /** Distance entre deux baies (m) */
  interRackM: number;
  /** Facteur de marge global */
  slackFactor: number;
  /** Arrondi commercial (m) */
  roundToM: number;
  /** Longueur minimale (m) */
  minLengthM: number;
  /** Tension de référence PDU (V) */
  pduVoltage: number;
  /** Déclassement d'usage continu des PDU */
  pduDerating: number;
}

export const DEFAULT_SETTINGS: DimensioningSettings = {
  uMm: 44.45,
  serviceLoopMm: 300,
  horizontalMm: 400,
  interRackM: 8,
  slackFactor: 1.1,
  roundToM: 0.5,
  minLengthM: 0.5,
  pduVoltage: 230,
  pduDerating: 0.8,
};

/** Préfixe des clés dans `custom_fields`. */
export const DIM_PREFIX = "dim.";

export type PortKind =
  "rj45" | "sfp+" | "sfp28" | "qsfp28" | "power" | "usb" | "other";

export interface DimensionedDevice {
  id: string;
  name: string;
  typeSlug: string;
  rackId: string;
  rackName: string;
  uStart: number;
  heightU: number;
  category?: string;
  powerW: number;
  tdpW: number;
  weightKg: number;
  mount: "horizontal" | "vertical";
  pduAmps: number;
  pduVolts: number;
}

export interface DimensionedCable {
  id: string;
  connectionId: string;
  cableType: string;
  lengthM: number;
  aDevice: string;
  aPort: string;
  aRack: string;
  aU: number;
  bDevice: string;
  bPort: string;
  bRack: string;
  bU: number;
  role: string;
  aLabel: string;
  bLabel: string;
  detail: string;
}

export interface RackStats {
  id: string;
  name: string;
  heightU: number;
  usedU: number;
  freeU: number;
  devices: number;
  servers: number;
  switches: number;
  firewalls: number;
  powerW: number;
  tdpW: number;
  btuH: number;
  weightKg: number;
  pduCount: number;
  pduMounts: string[];
  pduAmps: number;
  pduCapacityW: number;
  requiredAmps: number;
  pduLoadPct: number;
  status: "ok" | "warning" | "overload" | "no-pdu";
}

export interface CableSummary {
  totalCables: number;
  totalMeters: number;
  byType: Record<string, { count: number; meters: number }>;
}

export interface DimensioningResult {
  racks: RackStats[];
  devices: DimensionedDevice[];
  cables: DimensionedCable[];
  totals: {
    powerW: number;
    tdpW: number;
    btuH: number;
    weightKg: number;
    pduCapacityW: number;
    requiredAmps: number;
  };
  summary: CableSummary;
  issues: { level: "error" | "warning"; code: string; message: string }[];
}

/** Accès typé aux métadonnées sans modifier les interfaces Rackula. */
export function dimFields(source?: {
  custom_fields?: Record<string, unknown>;
}): Record<string, unknown> {
  return source?.custom_fields ?? {};
}

export function readNum(
  type: DeviceType,
  placed: PlacedDevice,
  key: string,
  fallback = 0,
): number {
  const own = dimFields(placed)[DIM_PREFIX + key];
  const inherited = dimFields(type)[DIM_PREFIX + key];
  const raw = own ?? inherited ?? fallback;
  const value = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export function readText(
  type: DeviceType,
  placed: PlacedDevice,
  key: string,
  fallback = "",
): string {
  const own = dimFields(placed)[DIM_PREFIX + key];
  const inherited = dimFields(type)[DIM_PREFIX + key];
  return typeof own === "string"
    ? own
    : typeof inherited === "string"
      ? inherited
      : fallback;
}
