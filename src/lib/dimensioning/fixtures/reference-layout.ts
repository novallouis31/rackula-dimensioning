/**
 * Baie type de référence (port de examples/baie-type.json de rack-42u-planner)
 * sous forme de Layout Rackula. Sert aux tests de non-régression.
 */
import type {
  Connection,
  DeviceType,
  InterfaceTemplate,
  Layout,
  PlacedDevice,
  Rack,
} from "$lib/types";
import { UNITS_PER_U } from "$lib/types/constants";

const IF = {
  rj45: "1000base-t",
  sfp: "10gbase-x-sfpp",
  sfp28: "25gbase-x-sfp28",
  qsfp: "100gbase-x-qsfp28",
  c14: "iec-60320-c14",
  c13: "iec-60320-c13",
} as const;

function iface(name: string, type: string): InterfaceTemplate {
  return { name, type } as InterfaceTemplate;
}

function type(
  slug: string,
  category: string,
  uHeight: number,
  weight: number,
  meta: Record<string, unknown>,
  interfaces: InterfaceTemplate[],
): DeviceType {
  return {
    slug,
    category: category as DeviceType["category"],
    u_height: uHeight,
    weight,
    weight_unit: "kg",
    custom_fields: Object.fromEntries(
      Object.entries(meta).map(([k, v]) => [`dim.${k}`, v]),
    ),
    interfaces,
    colour: "#3b82f6",
  } as DeviceType;
}

function place(
  id: string,
  slug: string,
  u: number,
  name: string,
  ports: [string, string][],
  meta?: Record<string, unknown>,
): PlacedDevice {
  return {
    id,
    device_type: slug,
    name,
    position: u * UNITS_PER_U,
    face: "front",
    ports: ports.map(([portName, portType]) => ({
      id: `${id}:${portName}`,
      template_name: portName,
      template_index: 0,
      type: portType as NonNullable<PlacedDevice["ports"]>[number]["type"],
    })),
    custom_fields: meta
      ? Object.fromEntries(
          Object.entries(meta).map(([k, v]) => [`dim.${k}`, v]),
        )
      : undefined,
  } as PlacedDevice;
}

const rack = {
  id: "rack-type",
  name: "Baie TYPE 42U",
  height: 42,
  width: 19,
  devices: [],
} as unknown as Rack;

const deviceTypes: DeviceType[] = [
  type("srv-1u", "server", 1, 18, { powerW: 450, tdpW: 450 }, [
    iface("mgmt1", IF.rj45),
    iface("eth-01", IF.rj45),
    iface("eth-02", IF.rj45),
    iface("sfp-01", IF.sfp),
    iface("sfp-02", IF.sfp),
    iface("PSU-01", IF.c14),
    iface("PSU-02", IF.c14),
  ]),
  type("srv-2u", "server", 2, 32, { powerW: 750, tdpW: 750 }, [
    iface("mgmt", IF.rj45),
    iface("sfp-01", IF.sfp28),
    iface("PSU-01", IF.c14),
  ]),
  type("sw-48g", "network", 1, 9, { powerW: 180, tdpW: 180 }, [
    ...Array.from({ length: 12 }, (_, i) =>
      iface(`ge-${String(i + 1).padStart(2, "0")}`, IF.rj45),
    ),
    iface("uplink-01", IF.sfp),
    iface("PSU-01", IF.c14),
    iface("PSU-02", IF.c14),
  ]),
  type("sw-24s", "network", 1, 11, { powerW: 320, tdpW: 320 }, [
    ...Array.from({ length: 10 }, (_, i) =>
      iface(`sfp-${String(i + 1).padStart(2, "0")}`, IF.sfp),
    ),
    iface("uplink-01", IF.qsfp),
    iface("PSU-01", IF.c14),
    iface("PSU-02", IF.c14),
  ]),
  type("fw-2u", "firewall", 2, 24, { powerW: 420, tdpW: 420 }, [
    iface("sfp-01", IF.sfp28),
    iface("sfp-02", IF.sfp28),
    iface("PSU-01", IF.c14),
    iface("PSU-02", IF.c14),
  ]),
  type("stor-2u", "storage", 2, 28, { powerW: 600, tdpW: 600 }, [
    iface("sfp-01", IF.sfp),
    iface("sfp-02", IF.sfp),
    iface("PSU-01", IF.c14),
    iface("PSU-02", IF.c14),
  ]),
  type("kvm-1u", "kvm", 1, 8, { powerW: 60, tdpW: 60 }, [iface("PSU", IF.c14)]),
  type("ups-3u", "power", 3, 45, {}, [iface("in", IF.c14)]),
  type("patch-24", "patch-panel", 1, 3, {}, [
    ...Array.from({ length: 8 }, (_, i) =>
      iface(`p-${String(i + 1).padStart(2, "0")}`, IF.rj45),
    ),
  ]),
  type(
    "pdu-0u",
    "power",
    0.5,
    6,
    { mount: "vertical", pduAmps: 16, pduVolts: 230 },
    [
      ...Array.from({ length: 14 }, (_, i) =>
        iface(`out-${String(i + 1).padStart(2, "0")}`, IF.c13),
      ),
    ],
  ),
  type(
    "pdu-1u-32a",
    "power",
    1,
    7,
    { mount: "horizontal", pduAmps: 32, pduVolts: 230 },
    [iface("out-01", IF.c13)],
  ),
];

const ports: Record<string, [string, string][]> = {
  "srv-1u": [
    ["mgmt1", IF.rj45],
    ["eth-01", IF.rj45],
    ["sfp-01", IF.sfp],
    ["PSU-01", IF.c14],
    ["PSU-02", IF.c14],
  ],
  "sw-24s": [
    ["sfp-01", IF.sfp],
    ["sfp-08", IF.sfp],
    ["sfp-09", IF.sfp],
    ["uplink-01", IF.qsfp],
    ["PSU-01", IF.c14],
    ["PSU-02", IF.c14],
  ],
  "sw-48g": [
    ["ge-01", IF.rj45],
    ["ge-02", IF.rj45],
    ["uplink-01", IF.sfp],
    ["PSU-01", IF.c14],
    ["PSU-02", IF.c14],
  ],
  "fw-2u": [
    ["sfp-01", IF.sfp28],
    ["sfp-02", IF.sfp28],
    ["PSU-01", IF.c14],
    ["PSU-02", IF.c14],
  ],
  "stor-2u": [
    ["sfp-01", IF.sfp],
    ["sfp-02", IF.sfp],
    ["PSU-01", IF.c14],
    ["PSU-02", IF.c14],
  ],
  "kvm-1u": [["PSU", IF.c14]],
  "ups-3u": [["in", IF.c14]],
  "patch-24": [["p-01", IF.rj45]],
  "pdu-0u": Array.from(
    { length: 14 },
    (_, i) =>
      [`out-${String(i + 1).padStart(2, "0")}`, IF.c13] as [string, string],
  ),
  "pdu-1u-32a": [["out-01", IF.c13]],
};

function pl(key: string): [string, string][] {
  return ports[key] ?? [];
}

const devices: PlacedDevice[] = [
  place("pdu-a", "pdu-0u", 1, "PDU-A", pl("pdu-0u")),
  place("pdu-b", "pdu-0u", 1, "PDU-B", pl("pdu-0u")),
  place("ups", "ups-3u", 24, "UPS-01", pl("ups-3u")),
  place("pdu-h", "pdu-1u-32a", 23, "PDU-H", pl("pdu-1u-32a")),
  place("stor", "stor-2u", 28, "SAN-01", pl("stor-2u")),
  ...Array.from({ length: 7 }, (_, i) =>
    place(
      `srv${String(i + 1).padStart(2, "0")}`,
      "srv-1u",
      36 - i,
      `srv${String(i + 1).padStart(2, "0")}`,
      pl("srv-1u"),
    ),
  ),
  place("patch", "patch-24", 37, "PP-01", pl("patch-24")),
  place("sw-acc", "sw-48g", 38, "SW-ACC-01", pl("sw-48g")),
  place("fw", "fw-2u", 39, "FW-01", pl("fw-2u")),
  place("sw-core", "sw-24s", 41, "SW-CORE-01", pl("sw-24s")),
  place("kvm", "kvm-1u", 42, "KVM-01", pl("kvm-1u")),
];
rack.devices = devices;

const connections: Connection[] = [];
function connect(
  a: string,
  aPort: string,
  b: string,
  bPort: string,
  role: string,
) {
  connections.push({
    id: `lnk-${String(connections.length + 1).padStart(3, "0")}`,
    a_port_id: `${a}:${aPort}`,
    b_port_id: `${b}:${bPort}`,
    label: role,
  });
}

for (let i = 1; i <= 7; i++) {
  const srv = `srv${String(i).padStart(2, "0")}`;
  connect(srv, "sfp-01", "sw-core", "sfp-01", "data");
}
connect("stor", "sfp-01", "sw-core", "sfp-08", "storage");
connect("stor", "sfp-02", "sw-core", "sfp-09", "storage");
connect("sw-core", "uplink-01", "fw", "sfp-01", "uplink");
connect("fw", "sfp-02", "sw-acc", "uplink-01", "uplink");
connect("pdu-h", "out-01", "ups", "in", "power");

export const REFERENCE_LAYOUT: Layout = {
  version: "1.0.0",
  name: "Baie TYPE — Référence",
  racks: [rack],
  device_types: deviceTypes,
  settings: {} as Layout["settings"],
  connections,
} as Layout;

/** Valeurs attendues (non-régression). */
export const EXPECTED = {
  devices: 17,
  connections: 12,
  racks: 1,
};
