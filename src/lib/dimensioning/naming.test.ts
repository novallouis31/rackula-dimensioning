import { describe, expect, it } from "vitest";
import { computeDimensioning } from "./engine";
import { exportLabelsHtml, buildTables, renderLabel } from "./export";
import { applyNaming, proposeNaming } from "./naming";
import { DEFAULT_SETTINGS } from "./types";
import { REFERENCE_LAYOUT } from "./fixtures/reference-layout";

describe("nommage et numérotation des ports", () => {
  it("propose des noms stables et des port IN/OUT catégorisés", () => {
    const proposal = proposeNaming(REFERENCE_LAYOUT);
    expect(proposal.deviceNames["srv01"]).toBe("srv01");
    expect(proposal.portLabels["srv01:mgmt1"]).toBe("ETH-IO-01");
    expect(proposal.portLabels["srv01:eth-01"]).toBe("ETH-IO-02");
    expect(proposal.portLabels["srv01:sfp-01"]).toBe("FIB-IO-01");
    expect(proposal.portLabels["pdu-a:out-01"]).toBe("PWR-IO-01");
    expect(proposeNaming(REFERENCE_LAYOUT)).toEqual(proposal);
  });

  it("applique les propositions sans écraser l'existant", () => {
    const layout = structuredClone(REFERENCE_LAYOUT);
    const unnamed = layout.racks[0].devices.find((d) => d.id === "kvm")!;
    unnamed.name = "";
    const proposal = proposeNaming(layout);
    const changes = applyNaming(layout, proposal);
    expect(changes).toBeGreaterThan(0);
    expect(unnamed.name).toBe("KVM-01");
    expect(layout.racks[0].devices.find((d) => d.id === "srv01")!.name).toBe(
      "srv01",
    );
  });
});

describe("matrice de câblage et étiquettes", () => {
  const result = computeDimensioning(REFERENCE_LAYOUT);
  const tables = buildTables("Baie TYPE", result);

  it("construit une matrice équipement ↔ équipement", () => {
    const sheet = tables.find((t) => t.name === "MatriceCablage")!;
    const header = sheet.rows[0] as string[];
    const row = (sheet.rows as string[][]).find((r) => r[0] === "srv01")!;
    const col = header.indexOf("SW-CORE-01");
    expect(col).toBeGreaterThan(0);
    expect(row[col]).toContain("CBL-0001");
  });

  it("construit une matrice port ↔ port et l'inventaire des ports", () => {
    const ports = tables.find((t) => t.name === "MatricePorts")!;
    const header = ports.rows[0] as string[];
    const aName = "srv01/sfp-01";
    const a = header.indexOf(aName);
    const b = header.indexOf("SW-CORE-01/sfp-01");
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
    const row = (ports.rows as string[][]).find((r) => r[0] === aName)!;
    expect(row[b]).toContain("CBL-0001");

    const inventory = tables.find((t) => t.name === "EquipementsPorts")!;
    expect(inventory.rows.length).toBeGreaterThan(10);
    expect(inventory.rows[1][4]).toBeTruthy();
  });

  it("utilise le format traditionnel source/port puis destination/port", () => {
    const cable = result.cables[0];
    const lines = renderLabel(cable, "A");
    expect(lines[0]).toBe(`${cable.aDevice} / ${cable.aPort}`);
    expect(lines[1]).toBe(`${cable.bDevice} / ${cable.bPort}`);
    const custom = renderLabel(cable, "B", "{PEER_DEVICE}:{PEER_PORT}");
    expect(custom).toEqual([`${cable.aDevice}:${cable.aPort}`]);
    expect(DEFAULT_SETTINGS.labelFormat).toContain("{PEER_DEVICE}");
  });

  it("génère une planche imprimable avec QR code et les deux extrémités", async () => {
    const html = await (await exportLabelsHtml(result)).text();
    expect(html).toContain('src="data:image/png;base64,');
    expect(html).toContain(result.cables[0].aDevice);
    expect(html).toContain(result.cables[0].bDevice);
    // eslint-disable-next-line no-restricted-syntax -- deux étiquettes par câble
    expect(html.match(/class="label"/g)).toHaveLength(24);
  });
});
