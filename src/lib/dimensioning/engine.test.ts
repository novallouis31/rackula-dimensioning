import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  computeCables,
  computeDimensioning,
  computeLength,
  detectCableType,
  dimensionedDevices,
  getSettings,
  cableSummary,
} from "./engine";
import { DEFAULT_SETTINGS } from "./types";
import { buildXlsx } from "./xlsx";
import { buildTables, exportLabelsHtml, toCsv } from "./export";
import { EXPECTED, REFERENCE_LAYOUT } from "./fixtures/reference-layout";

describe("moteur de dimensionnement — baie type", () => {
  const settings = getSettings(REFERENCE_LAYOUT);
  const devices = dimensionedDevices(REFERENCE_LAYOUT);
  const result = computeDimensioning(REFERENCE_LAYOUT, settings);

  it("lit les équipements et leurs métadonnées custom_fields", () => {
    expect(devices).toHaveLength(EXPECTED.devices);
    const srv = devices.find((d) => d.id === "srv01");
    expect(srv?.powerW).toBe(450);
    expect(srv?.tdpW).toBe(450);
    expect(srv?.uStart).toBe(36);
    expect(srv?.heightU).toBe(1);
    const pdu = devices.find((d) => d.id === "pdu-a");
    expect(pdu?.mount).toBe("vertical");
    expect(pdu?.heightU).toBe(0);
    expect(pdu?.pduAmps).toBe(16);
  });

  it("calcule U, puissance, TDP, poids et PDU", () => {
    // eslint-disable-next-line no-restricted-syntax -- invariant de la baie type de référence
    expect(result.racks).toHaveLength(1);
    const rack = result.racks[0];
    expect(rack.usedU).toBe(19);
    expect(rack.freeU).toBe(23);
    expect(rack.powerW).toBe(4730);
    expect(rack.tdpW).toBe(4730);
    expect(rack.btuH).toBe(16139);
    expect(rack.weightKg).toBe(273);
    expect(rack.pduAmps).toBe(64);
    expect(rack.pduCapacityW).toBe(11776);
    expect(rack.requiredAmps).toBe(20.6);
    expect(rack.pduLoadPct).toBe(40.2);
    expect(rack.status).toBe("ok");
    expect(result.totals.tdpW).toBe(4730);
    expect(result.totals.weightKg).toBe(273);
  });

  it("calcule les câbles et les étiquettes", () => {
    expect(result.cables).toHaveLength(EXPECTED.connections);
    const summary = cableSummary(result.cables);
    expect(summary.byType["DAC SFP+"]?.count).toBe(9);
    expect(summary.byType["DAC QSFP28"]?.count).toBe(1);
    expect(summary.byType["DAC SFP28"]?.count).toBe(1);
    expect(summary.byType["Cordon C13-C14"]?.count).toBe(1);
    expect(result.cables[0].id).toBe("CBL-0001");
    expect(result.cables[0].aLabel).toContain("|A|");
    expect(result.cables[0].bLabel).toContain("|B|");
    expect(result.cables.every((c) => c.lengthM >= 0.5)).toBe(true);
  });

  it("détecte le type de câble selon les connecteurs et la distance", () => {
    expect(detectCableType("rj45", "rj45", 3)).toBe("Cat6A");
    expect(detectCableType("sfp+", "sfp+", 3)).toBe("DAC SFP+");
    expect(detectCableType("sfp+", "sfp+", 30)).toBe("Fibre LC-LC OM4");
    expect(detectCableType("qsfp28", "qsfp28", 3)).toBe("DAC QSFP28");
    expect(detectCableType("power", "power", 2)).toBe("Cordon C13-C14");
  });

  it("apporte la marge et arrondit aux longueurs commerciales", () => {
    const base = computeLength(30, 36, 42, 42, true, settings);
    expect(base.lengthM).toBe(1.5);
    expect(base.detail).toContain("same rack");
    const slack = computeLength(30, 31, 42, 42, true, settings, 20);
    expect(slack.lengthM).toBeGreaterThan(20);
    const far = computeLength(30, 41, 42, 42, false, settings, 0, "A", "B");
    expect(far.detail).toContain("inter-rack");
    expect(far.lengthM).toBeGreaterThanOrEqual(8);
  });

  it("réagit aux paramètres sans toucher au layout", () => {
    const relaxed = {
      ...settings,
      slackFactor: 1.5,
      serviceLoopMm: 500,
    };
    const cables = computeCables(REFERENCE_LAYOUT, devices, relaxed);
    const original = computeCables(REFERENCE_LAYOUT, devices, settings);
    expect(cables.reduce((s, c) => s + c.lengthM, 0)).toBeGreaterThan(
      original.reduce((s, c) => s + c.lengthM, 0),
    );
    expect(getSettings(REFERENCE_LAYOUT)).toEqual(DEFAULT_SETTINGS);
  });

  it("signale une surcharge PDU", () => {
    const check = computeDimensioning(REFERENCE_LAYOUT, {
      ...DEFAULT_SETTINGS,
      pduDerating: 0.05,
    });
    expect(check.issues.some((i) => i.code === "PDU_OVERLOAD")).toBe(true);
  });
});

describe("exports", () => {
  const result = computeDimensioning(REFERENCE_LAYOUT);
  const tables = buildTables("Baie TYPE", result);

  it("produit les 9 feuilles attendues", () => {
    expect(tables.map((t) => t.name)).toEqual([
      "Synthese",
      "Baies",
      "Equipements",
      "EquipementsPorts",
      "MatriceCablage",
      "MatricePorts",
      "Cables",
      "Etiquettes",
      "Types",
    ]);
    // eslint-disable-next-line no-restricted-syntax -- 12 câbles + en-tête
    expect(tables.find((t) => t.name === "Cables")?.rows).toHaveLength(13);
    // eslint-disable-next-line no-restricted-syntax -- 24 étiquettes + en-tête
    expect(tables.find((t) => t.name === "Etiquettes")?.rows).toHaveLength(25);
  });

  it("génère un vrai classeur XLSX lisible", async () => {
    const blob = await buildXlsx(tables);
    expect(blob.size).toBeGreaterThan(1000);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(zip.file("xl/workbook.xml")).toBeTruthy();
    const sheets = Object.values(zip.files)
      .filter((f) => !f.dir && f.name.startsWith("xl/worksheets/sheet"))
      .map((f) => f.async("string"));
    const contents = await Promise.all(sheets);
    expect(contents.some((xml) => xml.includes("CBL-0001"))).toBe(true);
  });

  it("génère un CSV et une planche d'étiquettes", async () => {
    const csv = toCsv(tables[0].rows);
    expect(csv).toContain("Projet");
    expect(csv.startsWith("\ufeff")).toBe(true);
    const html = await (await exportLabelsHtml(result)).text();
    expect(html).toContain("CBL-0001A");
    // eslint-disable-next-line no-restricted-syntax -- deux étiquettes par câble
    expect(html.match(/class="label"/g)).toHaveLength(24);
  });
});
