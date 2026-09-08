import { OperationsPanel, type ExternalIntegrationStatus } from "./OperationsPanel";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { requirementSummary, REQUIREMENTS_READINESS, type ImplementationStatus } from "./requirementsReadiness";
import { buildReadinessEvidence } from "./readinessEvidence";
import { DEOKSUNG_DEM } from "./terrainConfig";
import { createDemoOverview } from "./demoOverview";
import { nmsSummary, receivedNumber } from "./nmsSummary";
import { buildOperationalEvidence } from "./operationalEvidence";
import { parseTelemetryMessage } from "./telemetryStream";
import RequirementsReadinessModal from "./RequirementsReadinessModal";

describe("truthful RFP evidence", () => {
  it("counts all implementation states independently from validation", () => {
    const statuses: ImplementationStatus[] = ["IMPLEMENTED", "PARTIAL", "CONTRACT_ONLY", "NOT_IMPLEMENTED"];
    const mixed = statuses.map(implementation => ({ ...REQUIREMENTS_READINESS[0], implementation, softwareComplete: false }));
    expect(requirementSummary(mixed)).toMatchObject({total:4, softwareComplete:1, implemented:1, partial:1, contractOnly:1, notImplemented:1, demoVerified:4});
  });
  it("exports separate official baselines and project targets, never acceptance claims", () => {
    const report = buildReadinessEvidence(new Date("2026-09-07T00:00:00Z"));
    expect(report.generatedAt).toBe("2026-09-07T00:00:00.000Z");
    expect(report.officialRfpBaseline).toEqual({networkDeploymentMinutes:10, locationUpdateSeconds:5, sharingSuccessPct:98, availabilityPct:98});
    expect(report.projectEnhancedTarget).toEqual({networkDeploymentMinutes:7, locationUpdateSeconds:3, sharingSuccessPct:98, availabilityPct:98});
    expect(report.demoDataContractCheck).toMatchObject({label:"DEMO 데이터·화면 계약 검증", total:40, failed:0});
    expect(report.officialRfpGaps.every(x => x.sourceRef.startsWith("RFP 인쇄 p.") && x.frontendEvidence && x.blocker)).toBe(true);
    expect(report.officialRfpGapSummary.notImplemented).toBeGreaterThan(0);
    expect(report.externalDependencies.length).toBeGreaterThan(0);
    expect(report.fieldDependencies.length).toBeGreaterThan(0);
    expect(report.limitations.length).toBeGreaterThan(0);
  });
  it("uses the actual bundled Deoksungsan 90m DEM for wildfire demo", () => {
    const wildfire = createDemoOverview(new Date(), "WILDFIRE");
    expect(wildfire.domainDetail?.terrain).toEqual(DEOKSUNG_DEM);
    expect(DEOKSUNG_DEM).toMatchObject({
      sourceId:"ngii-36607-2025",
      resolutionMeters:90,
      sourceCrs:"EPSG:5179",
      encoding:"terrarium",
      maxzoom:13,
      resolutionLabel:"90m 공개DEM",
      sourceLabel:"예산 덕숭산 36607 실지형",
    });
    expect(DEOKSUNG_DEM.tiles[0]).toBe("/dem/36607/{z}/{x}/{y}.png");
    expect(createDemoOverview(new Date(), "LANDSLIDE").domainDetail?.terrain).not.toEqual(DEOKSUNG_DEM);
  });
  it("renders implementation and contract-check wording without blanket completion", () => {
    const html = renderToStaticMarkup(createElement(RequirementsReadinessModal,{onClose:()=>{}}));
    expect(html).toContain("내부 SW 요구사항 추적");
    expect(html).toContain("공식 RFP Gap");
    expect(html).toContain("부분구현");
    expect(html).not.toContain("SW 완료");
    expect(html).not.toContain("AUTOMATED DEMO ACCEPTANCE");
  });
  it("does not fabricate KPI times or measurements from empty input", () => {
    const report = buildOperationalEvidence({eventId:"event",runId:"export",samples:[]});
    expect(report.metrics).toMatchObject({averageLatencySec:null,maxGapSec:null,availabilityPct:null,sharingSuccessPct:null,networkDeploymentMinutes:null});
    for (const [startedAt,networkReadyAt] of [["bad","bad"],["2026-09-07T01:00:00Z","2026-09-07T00:00:00Z"]]) {
      expect(buildOperationalEvidence({eventId:"e",runId:"r",samples:[],startedAt,networkReadyAt}).metrics.networkDeploymentMinutes).toBeNull();
    }
  });
});
describe("NMS/BMS received values", () => {
  it("retains missing battery values through telemetry parsing", () => {
    const message = parseTelemetryMessage({assetId:"A", observedAt:"2026-09-07T00:00:00Z",latitude:37,longitude:128,batteryPct:null});
    expect(message?.batteryPct).toBeUndefined();
    expect(nmsSummary([], [{attributes:{voltageBatteryMv:12000}}, {attributes:{voltageBatteryMv:65535}}]).minVoltageV).toBe(12);
  });
  it("preserves unknown values rather than converting missing values to zero", () => {
    for (const raw of [null,undefined,"", " ", false, {}, [], "bad", Infinity]) expect(receivedNumber(raw)).toBeNull();
    expect(receivedNumber(0)).toBe(0);
    expect(nmsSummary([],[])).toMatchObject({networksReceived:0,minBatteryPct:null,lowBatteryCount:null,lastReceivedAt:null});
  });
  it("counts only valid battery samples and explicit network states", () => {
    expect(nmsSummary([{status:"ACTIVE"},{status:"DEGRADED"},{status:"FAILED"},{}],[{batteryPct:0},{batteryPct:"19"},{batteryPct:78},{batteryPct:null},{batteryPct:-1},{batteryPct:101}])).toMatchObject({active:1,degraded:1,failed:1,unknown:1,batteriesReceived:3,minBatteryPct:0,lowBatteryCount:2});
  });
});


describe("operations tab contracts", () => {
  const renderPanel = (activeTab: "networks" | "reports") => renderToStaticMarkup(createElement(OperationsPanel, {
    overview:createDemoOverview(new Date("2026-09-07T00:00:00Z"), "WILDFIRE"), visibleLayerIds:new Set<string>(), onLayerToggle:()=>{}, visibleResourceGroups:new Set<import("./UnifiedDisasterDashboard").ResourceGroup>(), onResourceGroupToggle:()=>{}, onResourceGroupInspect:()=>{}, locations:[], lastUpdatedAt:null, activeTab, onActiveTabChange:()=>{},
    externalIntegrationStatus:Object.fromEntries(["firms","wildfireRisk","landslideForecast","landslideHistory","landslideRegionalRisk"].map(id=>[id,{status:"idle",count:0,checkedAt:null}])) as ExternalIntegrationStatus,
    onRefreshExternalIntegrations:()=>{}, telemetryStreamStatus:"DISABLED",telemetrySamples:[],onOpenDroneVideo:()=>{},
  }));
  it("shows NMS data without unrelated layer controls and preserves active versus primary paths", () => {
    const html = renderPanel("networks");
    expect(html).toContain("NMS / 전원·BMS 요약");
    expect(html).toContain("최저 수신 전압");
    expect(html).toContain("현재 경로 LTE 백홀");
    expect(html).toContain("기본 경로 이음5G");
    expect(html).not.toContain("외부기관 데이터 레이어");
  });
  it("combines read-only situation context without inventing report submission", () => {
    const html = renderPanel("reports");
    expect(html).toContain("현장 통합정보");
    expect(html).toContain("예산군 덕산면 덕숭산 산림화재 대응");
    expect(html).toContain("동측 화선 대응 보고");
    expect(html).toContain("보고 송신·영상 재생은 별도 연계 대기");
    expect(html).not.toContain("외부기관 데이터 레이어");
  });
});
