/**
 * Nommage des équipements et proposition de numéros de port entrée/sortie.
 *
 * Les propositions sont déterministes : pour un même layout, on obtient
 * toujours les mêmes noms et les mêmes étiquettes de port. Elles alimentent
 * directement les étiquettes et la matrice de câblage.
 */
import type { Layout, PlacedDevice, DeviceType } from "$lib/types";
import { dimFields } from "./types";

export interface NamingProposal {
  /** deviceId -> nom proposé (SRV-01, SW-01, PDU-A, ...) */
  deviceNames: Record<string, string>;
  /** portId -> étiquette proposée (ETH-IO-01, PWR-IN-01, ...) */
  portLabels: Record<string, string>;
}

const PREFIXES: Record<string, string> = {
  server: "SRV",
  network: "SW",
  firewall: "FW",
  storage: "STO",
  "patch-panel": "PP",
  kvm: "KVM",
  ups: "UPS",
  pdu: "PDU",
  power: "PWR",
  "av-media": "AV",
  cooling: "FAN",
  other: "DEV",
};

function devicePrefix(
  type: DeviceType | undefined,
  device: PlacedDevice,
): string {
  if (!type) return "DEV";
  const isPdu =
    Number(dimFields(type)[DIM_PREFIX_AMPS] ?? 0) > 0 ||
    Number(dimFields(device)[DIM_PREFIX_AMPS] ?? 0) > 0;
  if (isPdu) return "PDU";
  return PREFIXES[type.category ?? ""] ?? "DEV";
}

const DIM_PREFIX_AMPS = "dim.pduAmps";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function portClass(portType: string): string {
  const t = (portType ?? "").toLowerCase();
  if (
    t.includes("power") ||
    t.includes("iec") ||
    t.includes("c13") ||
    t.includes("c14")
  )
    return "PWR";
  if (
    t.includes("qsfp") ||
    t.includes("sfp") ||
    t.includes("25g") ||
    t.includes("100g")
  )
    return "FIB";
  if (t.includes("base-t") || t.includes("rj45") || t.includes("gbase"))
    return "ETH";
  if (t.includes("usb")) return "USB";
  return "AUX";
}

function directionOf(
  port: { direction?: string; template_name: string },
  type: DeviceType | undefined,
): "IN" | "OUT" | "IO" {
  const template = type?.interfaces?.find((i) => i.name === port.template_name);
  const direction = port.direction ?? template?.direction ?? "bidirectional";
  if (direction === "input") return "IN";
  if (direction === "output") return "OUT";
  return "IO";
}

/**
 * Calcule les propositions pour tout le layout.
 * Ne modifie rien : l'application est explicite via `applyNaming`.
 */
export function proposeNaming(layout: Layout): NamingProposal {
  const types = new Map<string, DeviceType>(
    layout.device_types.map((t) => [t.slug, t]),
  );
  const deviceNames: Record<string, string> = {};
  const portLabels: Record<string, string> = {};
  const counters = new Map<string, number>();

  for (const rack of layout.racks) {
    for (const device of rack.devices) {
      const type = types.get(device.device_type);
      const prefix = devicePrefix(type, device);
      const key = `${rack.id}:${prefix}`;
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      deviceNames[device.id] = device.name || `${prefix}-${pad(next)}`;

      const portCounters = new Map<string, number>();
      for (const port of device.ports ?? []) {
        const cls = portClass(port.type);
        const dir = directionOf(port, type);
        const pKey = `${device.id}:${cls}:${dir}`;
        const pNext = (portCounters.get(pKey) ?? 0) + 1;
        portCounters.set(pKey, pNext);
        portLabels[port.id] = `${cls}-${dir}-${pad(pNext)}`;
      }
    }
  }
  return { deviceNames, portLabels };
}

export interface ApplyNamingOptions {
  /** Écraser un nom déjà renseigné (défaut false). */
  overwriteNames?: boolean;
  /** Écraser une étiquette de port déjà renseignée (défaut false). */
  overwriteLabels?: boolean;
}

/**
 * Applique les propositions sur le layout (mutation réactive Svelte).
 * Retourne le nombre de modifications effectuées.
 */
export function applyNaming(
  layout: Layout,
  proposal: NamingProposal,
  options: ApplyNamingOptions = {},
): number {
  let changes = 0;
  for (const rack of layout.racks) {
    for (const device of rack.devices) {
      const proposedName = proposal.deviceNames[device.id];
      if (
        proposedName &&
        (options.overwriteNames || !device.name) &&
        device.name !== proposedName
      ) {
        device.name = proposedName;
        changes++;
      }
      for (const port of device.ports ?? []) {
        const proposedLabel = proposal.portLabels[port.id];
        if (
          proposedLabel &&
          (options.overwriteLabels || !port.label) &&
          port.label !== proposedLabel
        ) {
          port.label = proposedLabel;
          changes++;
        }
      }
    }
  }
  return changes;
}
