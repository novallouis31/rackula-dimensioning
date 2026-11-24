/**
 * Moteur de calcul — port TypeScript du moteur Python de rack-42u-planner.
 *
 * Fonctions pures : elles consomment un `Layout` Rackula et ne mutent rien.
 */
import type { Layout, Rack, DeviceType, PlacedDevice } from "$lib/types";
import { UNITS_PER_U } from "$lib/types/constants";
import {
  DEFAULT_SETTINGS,
  DIM_PREFIX,
  dimFields,
  readNum,
  readText,
  type CableSummary,
  type DimensionedCable,
  type DimensionedDevice,
  type DimensioningResult,
  type DimensioningSettings,
  type PortKind,
  type RackStats,
} from "./types";

type DimensionedLayout = Layout & {
  dimensioning?: { settings?: Partial<DimensioningSettings> };
};

/* ------------------------------------------------------------------ */
/* Lecture du layout                                                   */
/* ------------------------------------------------------------------ */

export function getSettings(layout: Layout): DimensioningSettings {
  const custom = (layout as DimensionedLayout).dimensioning?.settings ?? {};
  return { ...DEFAULT_SETTINGS, ...custom };
}

function weightKg(type: DeviceType): number {
  const raw = type.weight ?? 0;
  return (type.weight_unit ?? "kg") === "lb" ? raw * 0.45359237 : raw;
}

function portKind(rackulaType?: string): PortKind {
  const t = (rackulaType ?? "").toLowerCase();
  if (t.includes("power") || t.includes("iec")) return "power";
  if (t.includes("usb")) return "usb";
  if (t.includes("qsfp") || t.includes("100g") || t.includes("28g"))
    return "qsfp28";
  if (t.includes("sfp28") || t.includes("25g")) return "sfp28";
  if (t.includes("sfp") || t.includes("10g")) return "sfp+";
  if (t.includes("base-t") || t.includes("rj45") || t.includes("gbase"))
    return "rj45";
  return "other";
}

/** Tous les équipements placés, avec leurs métriques de dimensionnement. */
export function dimensionedDevices(layout: Layout): DimensionedDevice[] {
  const types = new Map<string, DeviceType>(
    layout.device_types.map((t) => [t.slug, t]),
  );
  const racks = new Map<string, Rack>(layout.racks.map((r) => [r.id, r]));
  const out: DimensionedDevice[] = [];

  for (const rack of layout.racks) {
    for (const device of rack.devices) {
      const type = types.get(device.device_type);
      if (!type) continue;
      const mountRaw = readText(type, device, "mount", "horizontal");
      const mount: "horizontal" | "vertical" =
        mountRaw === "vertical" ? "vertical" : "horizontal";
      const powerW = readNum(type, device, "powerW", 0);
      out.push({
        id: device.id,
        name: device.name || type.model || type.slug,
        typeSlug: type.slug,
        rackId: rack.id,
        rackName: rack.name,
        uStart: device.position / UNITS_PER_U,
        heightU: mount === "vertical" ? 0 : type.u_height,
        category: type.category,
        powerW,
        tdpW: readNum(type, device, "tdpW", powerW),
        weightKg: weightKg(type),
        mount,
        pduAmps: readNum(type, device, "pduAmps", 0),
        pduVolts: readNum(type, device, "pduVolts", 230),
        ports: (device.ports ?? []).map((port) => ({
          id: port.id,
          name: port.label || port.template_name,
          label: port.label || port.template_name,
          kind: portKind(port.type),
        })),
      });
    }
  }
  void racks;
  return out;
}

/* ------------------------------------------------------------------ */
/* Câbles                                                              */
/* ------------------------------------------------------------------ */

export function detectCableType(
  kindA: PortKind,
  kindB: PortKind,
  lengthM: number,
): string {
  const kinds = new Set([kindA, kindB]);
  if (kinds.has("power")) return "Cordon C13-C14";
  if (kinds.has("usb")) return "USB A-B";
  if (kinds.has("qsfp28"))
    return lengthM <= 5 ? "DAC QSFP28" : "Fibre QSFP28 LC-LC";
  if (kinds.has("sfp28")) return lengthM <= 5 ? "DAC SFP28" : "Fibre LC-LC OM4";
  if (kinds.has("sfp+")) return lengthM <= 5 ? "DAC SFP+" : "Fibre LC-LC OM4";
  return "Cat6A";
}

interface LengthResult {
  lengthM: number;
  detail: string;
}

export function computeLength(
  uA: number,
  uB: number,
  rackAHeight: number,
  rackBHeight: number,
  sameRack: boolean,
  settings: DimensioningSettings,
  extraM = 0,
  rackAName = "",
  rackBName = "",
): LengthResult {
  let verticalMm: number;
  let horizontalMm: number;
  let route: string;
  if (sameRack) {
    verticalMm = Math.abs(uA - uB) * settings.uMm;
    horizontalMm = settings.horizontalMm;
    route = `same rack (${rackAName} / U${uA} -> U${uB})`;
  } else {
    verticalMm = (rackAHeight - uA + 1 + (rackBHeight - uB + 1)) * settings.uMm;
    horizontalMm = settings.interRackM * 1000;
    route = `inter-rack (${rackAName} -> ${rackBName}, ${settings.interRackM} m)`;
  }
  const loopsMm = 2 * settings.serviceLoopMm;
  const rawMm = verticalMm + horizontalMm + loopsMm + extraM * 1000;
  const withSlackMm = rawMm * settings.slackFactor;
  const stepMm = (settings.roundToM || 0.5) * 1000;
  const lengthM = Math.max(
    settings.minLengthM,
    Math.ceil(withSlackMm / stepMm) * settings.roundToM,
  );
  const detail = `${route} | vertical ${(verticalMm / 1000).toFixed(2)} m + horizontal ${(
    horizontalMm / 1000
  ).toFixed(2)} m + loops ${(loopsMm / 1000).toFixed(2)} m${
    extraM ? ` + ${extraM.toFixed(2)} m` : ""
  } | slack x${settings.slackFactor.toFixed(2)} -> ${(
    withSlackMm / 1000
  ).toFixed(2)} m -> ${lengthM.toFixed(1)} m`;
  return { lengthM: Math.round(lengthM * 100) / 100, detail };
}

interface PortRef {
  device: DimensionedDevice;
  portName: string;
  kind: PortKind;
}

function portIndex(
  layout: Layout,
  devices: DimensionedDevice[],
): Map<string, PortRef> {
  const types = new Map<string, DeviceType>(
    layout.device_types.map((t) => [t.slug, t]),
  );
  const placed = new Map<string, PlacedDevice>();
  for (const rack of layout.racks) {
    for (const d of rack.devices) placed.set(d.id, d);
  }
  const byId = new Map(devices.map((d) => [d.id, d]));
  const index = new Map<string, PortRef>();
  for (const [id, device] of placed) {
    const meta = byId.get(id);
    const type = types.get(device.device_type);
    if (!meta || !type) continue;
    for (const port of device.ports ?? []) {
      index.set(port.id, {
        device: meta,
        portName: port.label || port.template_name,
        kind: portKind(port.type),
      });
    }
  }
  return index;
}

/** Câbles calculés à partir des connexions Rackula. */
export function computeCables(
  layout: Layout,
  devices: DimensionedDevice[],
  settings: DimensioningSettings,
): DimensionedCable[] {
  const ports = portIndex(layout, devices);
  const racks = new Map(layout.racks.map((r) => [r.id, r]));
  const cables: DimensionedCable[] = [];

  for (const connection of layout.connections ?? []) {
    const a = ports.get(connection.a_port_id);
    const b = ports.get(connection.b_port_id);
    if (!a || !b) continue;
    const rackA = racks.get(a.device.rackId);
    const rackB = racks.get(b.device.rackId);
    const sameRack = a.device.rackId === b.device.rackId;
    const extraM = Number(
      dimFields({
        custom_fields: {
          ...(connection as { custom_fields?: Record<string, unknown> })
            .custom_fields,
        },
      })[DIM_PREFIX + "slackM"] ?? 0,
    );
    const { lengthM, detail } = computeLength(
      a.device.uStart,
      b.device.uStart,
      rackA?.height ?? 42,
      rackB?.height ?? 42,
      sameRack,
      settings,
      Number.isFinite(extraM) ? extraM : 0,
      a.device.rackName,
      b.device.rackName,
    );
    const customType = dimFields(
      connection as { custom_fields?: Record<string, unknown> },
    )[DIM_PREFIX + "cableType"];
    const cableType =
      typeof customType === "string" && customType
        ? customType
        : detectCableType(a.kind, b.kind, lengthM);
    const role = dimFields(
      connection as { custom_fields?: Record<string, unknown> },
    )[DIM_PREFIX + "role"];
    const id = `CBL-${String(cables.length + 1).padStart(4, "0")}`;
    cables.push({
      id,
      connectionId: connection.id,
      cableType,
      lengthM,
      aDevice: a.device.name,
      aPort: a.portName,
      aRack: a.device.rackName,
      aU: a.device.uStart,
      bDevice: b.device.name,
      bPort: b.portName,
      bRack: b.device.rackName,
      bU: b.device.uStart,
      role: typeof role === "string" ? role : (connection.label ?? ""),
      aLabel: `${id}|A|${a.device.name}/${a.portName}|${a.device.rackName}/U${a.device.uStart}`,
      bLabel: `${id}|B|${b.device.name}/${b.portName}|${b.device.rackName}/U${b.device.uStart}`,
      detail,
    });
  }
  return cables;
}

/* ------------------------------------------------------------------ */
/* Statistiques                                                        */
/* ------------------------------------------------------------------ */

export function cableSummary(cables: DimensionedCable[]): CableSummary {
  const byType: CableSummary["byType"] = {};
  for (const cable of cables) {
    const row = byType[cable.cableType] ?? { count: 0, meters: 0 };
    row.count += 1;
    row.meters += cable.lengthM;
    byType[cable.cableType] = row;
  }
  for (const row of Object.values(byType)) {
    row.meters = Math.round(row.meters * 10) / 10;
  }
  return {
    totalCables: cables.length,
    totalMeters:
      Math.round(cables.reduce((s, c) => s + c.lengthM, 0) * 10) / 10,
    byType,
  };
}

function rackStats(
  rack: Rack,
  devices: DimensionedDevice[],
  settings: DimensioningSettings,
): RackStats {
  const items = devices.filter((d) => d.rackId === rack.id);
  // Rackula classe les PDU dans "power" ; notre modèle Python utilise "pdu".
  // On reconnaît donc une PDU par son ampérage déclaré, quelle que soit la
  // catégorie, ce qui reste compatible avec les deux taxonomies.
  const pdus = items.filter((d) => d.category === "pdu" || d.pduAmps > 0);
  const pduIds = new Set(pdus.map((d) => d.id));
  const consumers = items.filter((d) => !pduIds.has(d.id));
  const powerW = consumers.reduce((s, d) => s + d.powerW, 0);
  const tdpW = consumers.reduce((s, d) => s + d.tdpW, 0);
  const usedU = items.reduce((s, d) => s + d.heightU, 0);
  const pduRawW = pdus.reduce((s, d) => s + d.pduAmps * d.pduVolts, 0);
  const pduCapacityW = pduRawW * settings.pduDerating;
  const requiredAmps = settings.pduVoltage ? powerW / settings.pduVoltage : 0;
  const pduLoadPct = pduCapacityW ? (100 * powerW) / pduCapacityW : 0;
  const status: RackStats["status"] = !pduCapacityW
    ? "no-pdu"
    : pduLoadPct > 100
      ? "overload"
      : pduLoadPct > 80
        ? "warning"
        : "ok";
  return {
    id: rack.id,
    name: rack.name,
    heightU: rack.height,
    usedU,
    freeU: rack.height - usedU,
    devices: items.length,
    servers: items.filter((d) => d.category === "server").length,
    switches: items.filter((d) => d.category === "network").length,
    firewalls: items.filter((d) => d.category === "firewall").length,
    powerW: Math.round(powerW * 10) / 10,
    tdpW: Math.round(tdpW * 10) / 10,
    btuH: Math.round(tdpW * 3.412),
    weightKg: Math.round(items.reduce((s, d) => s + d.weightKg, 0) * 10) / 10,
    pduCount: pdus.length,
    pduMounts: [...new Set(pdus.map((d) => d.mount))].sort(),
    pduAmps: pdus.reduce((s, d) => s + d.pduAmps, 0),
    pduCapacityW: Math.round(pduCapacityW),
    requiredAmps: Math.round(requiredAmps * 10) / 10,
    pduLoadPct: Math.round(pduLoadPct * 10) / 10,
    status,
  };
}

/** Calcul complet pour un layout Rackula. */
export function computeDimensioning(
  layout: Layout,
  settings: DimensioningSettings = getSettings(layout),
): DimensioningResult {
  const devices = dimensionedDevices(layout);
  const cables = computeCables(layout, devices, settings);
  const racks = layout.racks.map((r) => rackStats(r, devices, settings));
  const totals = {
    powerW: Math.round(racks.reduce((s, r) => s + r.powerW, 0) * 10) / 10,
    tdpW: Math.round(racks.reduce((s, r) => s + r.tdpW, 0) * 10) / 10,
    btuH: racks.reduce((s, r) => s + r.btuH, 0),
    weightKg: Math.round(racks.reduce((s, r) => s + r.weightKg, 0) * 10) / 10,
    pduCapacityW: racks.reduce((s, r) => s + r.pduCapacityW, 0),
    requiredAmps:
      Math.round(racks.reduce((s, r) => s + r.requiredAmps, 0) * 10) / 10,
  };
  const issues: DimensioningResult["issues"] = [];
  for (const rack of racks) {
    if (rack.freeU < 0) {
      issues.push({
        level: "error",
        code: "U_OVERFLOW",
        message: `${rack.name}: ${-rack.freeU}U de dépassement`,
      });
    }
    if (rack.status === "overload") {
      issues.push({
        level: "error",
        code: "PDU_OVERLOAD",
        message: `${rack.name}: charge PDU ${rack.pduLoadPct} %`,
      });
    } else if (rack.status === "no-pdu" && rack.powerW > 0) {
      issues.push({
        level: "warning",
        code: "NO_PDU",
        message: `${rack.name}: aucune PDU déclarée`,
      });
    }
  }
  return {
    racks,
    devices,
    cables,
    totals,
    summary: cableSummary(cables),
    issues,
  };
}
