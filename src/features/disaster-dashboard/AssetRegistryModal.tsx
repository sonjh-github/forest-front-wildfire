import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { forestApi, invalidateAssetCatalog, type ApiRecord, type ForestEvent } from "../../http-api";

const ASSET_TYPES = [
  ["UAV", "무인기"],
  ["MAIN_RELAY_DRONE", "주 중계 드론"],
  ["SERVICE_RELAY_DRONE", "서비스 중계 드론"],
  ["GCS", "드론 지상통제장치(GCS)"],
  ["RTK_TERMINAL", "대원 RTK 단말"],
  ["PERSONNEL_TERMINAL", "대원 통합단말"],
  ["RTK_BASE_LPWA_GATEWAY", "이동형 RTK 기준국·LPWA 게이트웨이"],
  ["TVWS_BASE_STATION", "TVWS 기지국"],
  ["TVWS_CPE", "TVWS CPE"],
  ["LTE_GATEWAY", "LTE 게이트웨이"],
  ["PRIVATE_5G_NTN_GATEWAY", "이음5G·저궤도위성 게이트웨이"],
  ["RADIO_GATEWAY_400MHZ", "400MHz 무전 게이트웨이"],
  ["COMMAND_VEHICLE", "현장지휘차량"],
  ["FIXED_RELAY", "고정형 임시 중계기"],
  ["MOBILE_RELAY", "이동 중계기"],
  ["REF_AP", "기준 AP"],
  ["ROVER_AP", "이동 AP"],
  ["RSSI_DETECTOR", "RSSI 탐지기"],
  ["IR_UWB_GPR", "IR-UWB·GPR 탐지장비"],
] as const;

const CAPABILITIES = ["GNSS", "RTK", "NTRIP", "RTCM", "LPWA", "WIFI", "LTE", "TVWS", "PRIVATE_5G", "LEO_NTN", "400MHZ", "EOIR", "GCS", "IR_UWB", "GPR"];
const TYPE_DEFAULTS: Record<string, string[]> = {
  UAV: ["GNSS", "LTE", "EOIR"], MAIN_RELAY_DRONE: ["GNSS", "LTE", "PRIVATE_5G"], SERVICE_RELAY_DRONE: ["GNSS", "LTE"],
  GCS: ["GCS", "LTE"], RTK_TERMINAL: ["GNSS", "RTK", "LPWA"], PERSONNEL_TERMINAL: ["GNSS", "WIFI", "LTE", "LPWA"],
  RTK_BASE_LPWA_GATEWAY: ["GNSS", "RTK", "NTRIP", "RTCM", "LPWA", "LTE"], TVWS_BASE_STATION: ["TVWS", "LTE"], TVWS_CPE: ["TVWS", "WIFI"],
  LTE_GATEWAY: ["LTE"], PRIVATE_5G_NTN_GATEWAY: ["PRIVATE_5G", "LEO_NTN", "LTE"], RADIO_GATEWAY_400MHZ: ["400MHZ"],
  COMMAND_VEHICLE: ["LTE", "TVWS", "PRIVATE_5G", "LEO_NTN"], FIXED_RELAY: ["LTE", "WIFI"], MOBILE_RELAY: ["LTE", "WIFI"],
  REF_AP: ["WIFI"], ROVER_AP: ["WIFI", "LTE"], RSSI_DETECTOR: ["WIFI", "LTE"], IR_UWB_GPR: ["IR_UWB", "GPR", "LTE"],
};

type AssetForm = {
  assetCode: string; assetType: string; assetName: string; ownerOrgCode: string;
  manufacturer: string; modelName: string; serialNumber: string; capabilities: string[];
  eventId: string; mission: string; videoStreamUri: string; videoChannelEnabled: boolean;
};

const initialForm = (): AssetForm => ({
  assetCode: "", assetType: "UAV", assetName: "", ownerOrgCode: "", manufacturer: "",
  modelName: "", serialNumber: "", capabilities: [...TYPE_DEFAULTS.UAV], eventId: "", mission: "",
  videoStreamUri: "", videoChannelEnabled: false,
});

const DRONE_ASSET_TYPES = new Set(["UAV", "MAIN_RELAY_DRONE", "SERVICE_RELAY_DRONE"]);

function value(asset: ApiRecord, key: string) { return asset[key] == null || asset[key] === "" ? "-" : String(asset[key]); }
function typeLabel(type: unknown) { return ASSET_TYPES.find(([id]) => id === type)?.[1] ?? "미설정"; }
function statusLabel(status: unknown) {
  return ({ REGISTERED: "등록", READY: "대기", ACTIVE: "운용", SUSPENDED: "정지", LOST: "분실", RETIRED: "폐기" } as Record<string, string>)[String(status)] ?? String(status ?? "확인 필요");
}

export default function AssetRegistryModal({ onClose, onRegistered }: { onClose: () => void; onRegistered?: () => void }) {
  const [assets, setAssets] = useState<ApiRecord[]>([]);
  const [events, setEvents] = useState<ForestEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [form, setForm] = useState<AssetForm>(initialForm);
  const [issueCredential, setIssueCredential] = useState(true);
  const [issuedCredential, setIssuedCredential] = useState<{ assetId: string; secret: string } | null>(null);
  const [credentialCopied, setCredentialCopied] = useState(false);

  const loadAssets = useCallback(async () => {
    setLoading(true);
    try {
      const result = await forestApi.assets(200);
      setAssets(result.data);
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "자산 원장을 불러오지 못했습니다." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadAssets(); }, [loadAssets]);
  useEffect(() => {
    void forestApi.events(100).then((result) => {
      setEvents(result.data.filter((item) => !["CLOSED", "CANCELLED"].includes(item.status ?? "")));
    }).catch(() => setEvents([]));
  }, []);

  const filteredAssets = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("ko-KR");
    return assets.filter((asset) => {
      const knownType = ASSET_TYPES.some(([id]) => id === asset.assetType);
      if (typeFilter === "UNASSIGNED" && knownType) return false;
      if (typeFilter !== "ALL" && typeFilter !== "UNASSIGNED" && asset.assetType !== typeFilter) return false;
      if (!keyword) return true;
      return [asset.assetCode, asset.assetName, asset.serialNumber, asset.modelName, asset.assetId, asset.ownerOrgCode]
        .some((item) => String(item ?? "").toLocaleLowerCase("ko-KR").includes(keyword));
    });
  }, [assets, query, typeFilter]);

  const updateType = (assetType: string) => setForm((current) => ({
    ...current, assetType, capabilities: [...(TYPE_DEFAULTS[assetType] ?? ["LTE"])],
  }));
  const toggleCapability = (capability: string) => setForm((current) => ({
    ...current,
    capabilities: current.capabilities.includes(capability)
      ? current.capabilities.filter((item) => item !== capability)
      : [...current.capabilities, capability],
  }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    if (!form.assetCode.trim() || !form.assetName.trim() || !form.serialNumber.trim()) {
      setMessage({ kind: "error", text: "자산관리번호, 자산명, 시리얼번호는 필수입니다." });
      return;
    }
    if (!form.capabilities.length) {
      setMessage({ kind: "error", text: "장비 기능을 한 개 이상 선택해 주세요." });
      return;
    }
    setSaving(true);
    setIssuedCredential(null);
    setCredentialCopied(false);
    try {
      const result = await forestApi.registerAsset({
        assetCode: form.assetCode.trim(), assetType: form.assetType, assetName: form.assetName.trim(),
        ownerOrgCode: form.ownerOrgCode.trim() || null, modelName: form.modelName.trim() || null,
        serialNumber: form.serialNumber.trim(), capabilities: form.capabilities,
        specifications: { manufacturer: form.manufacturer.trim() || null },
      });
      const assetId = String(result.data.assetId ?? "");
      let credentialIssued = false;
      let eventAssigned = false;
      let videoChannelRegistered = false;
      if (DRONE_ASSET_TYPES.has(form.assetType) && form.videoStreamUri.trim() && assetId) {
        try {
          await forestApi.registerVideoChannel(assetId, {
            channelCode: "MAIN", channelName: "주 영상",
            streamUri: form.videoStreamUri.trim(), enabled: form.videoChannelEnabled,
          });
          videoChannelRegistered = true;
        } catch (error) {
          setMessage({
            kind: "error",
            text: `자산은 등록되었지만 영상 채널 등록에 실패했습니다. ${error instanceof Error ? error.message : "영상 채널 주소를 확인해 주세요."}`,
          });
        }
      }
      if (issueCredential && assetId) {
        try {
          const credentialResult = await forestApi.issueDeviceCredential(assetId);
          setIssuedCredential({ assetId, secret: credentialResult.data.secret });
          credentialIssued = true;
        } catch (error) {
          setMessage({
            kind: "error",
            text: `자산 등록은 완료됐지만 인증키 발급에 실패했습니다. ${error instanceof Error ? error.message : "인증 저장소를 확인해 주세요."}`,
          });
        }
      }
      if (form.eventId && assetId) {
        try {
          await forestApi.assignAssetToEvent(form.eventId, {
            eventResourceId: crypto.randomUUID(), assetId,
            assignedOrgCode: form.ownerOrgCode.trim() || null,
            mission: form.mission.trim() || null,
            assignedAt: new Date().toISOString(), releasedAt: null,
          });
          eventAssigned = true;
        } catch (error) {
          setMessage({
            kind: "error",
            text: `자산${credentialIssued ? "과 인증키" : ""}는 등록됐지만 재난 프로젝트 배정에 실패했습니다. ${error instanceof Error ? error.message : "배정 정보를 확인해 주세요."}`,
          });
        }
      }
      invalidateAssetCatalog();
      setForm(initialForm());
      if ((!issueCredential || credentialIssued) && (!form.eventId || eventAssigned)
        && (!form.videoStreamUri.trim() || videoChannelRegistered)) {
        setMessage({
          kind: "success",
          text: `${value(result.data, "assetCode")} 자산 등록${issueCredential ? "·인증키 발급" : ""}${form.eventId ? "·재난 프로젝트 배정" : ""}이 완료되었습니다.`,
        });
      }
      await loadAssets();
      onRegistered?.();
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "자산 등록에 실패했습니다." });
    } finally {
      setSaving(false);
    }
  };

  const copyCredential = async () => {
    if (!issuedCredential) return;
    try {
      await navigator.clipboard.writeText(issuedCredential.secret);
      setCredentialCopied(true);
    } catch {
      setMessage({ kind: "error", text: "클립보드에 복사하지 못했습니다. 인증키를 직접 선택해 복사해 주세요." });
    }
  };

  return <div className="asset-registry-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="asset-registry-modal" role="dialog" aria-modal="true" aria-labelledby="asset-registry-title" onMouseDown={(event) => event.stopPropagation()}>
      <header className="asset-registry-header">
        <div><small>GLOBAL ASSET REGISTRY</small><h2 id="asset-registry-title">통합 자산 등록·관리</h2><p>장비를 사건과 무관한 전역 자산 원장에 먼저 등록합니다.</p></div>
        <button type="button" onClick={onClose} aria-label="자산 등록 화면 닫기">×</button>
      </header>
      <div className="asset-boundary-guide">
        <div><b>① 자산 등록</b><span>자산관리번호·시리얼을 확인하고 UUID 발급</span></div><i>→</i>
        <div><b>② 재난 프로젝트 배치</b><span>등록 중 선택하거나 나중에 별도로 투입</span></div><i>→</i>
        <div><b>③ 상태 수집</b><span>배치된 자산의 위치·통신·운용상태 기록</span></div>
      </div>
      <div className="asset-registry-body">
        <section className="asset-catalog-panel" aria-label="등록 자산 원장">
          <header><div><small>등록 자산 원장</small><strong>{assets.length}대</strong></div><span>사건 미배치 자산도 포함</span></header>
          <div className="asset-catalog-filter">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="자산명·관리번호·시리얼·UUID 검색" aria-label="자산 검색" />
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="자산 유형 필터">
              <option value="ALL">전체 유형</option><option value="UNASSIGNED">미설정</option>{ASSET_TYPES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </div>
          <div className="asset-catalog-list">
            {filteredAssets.map((asset) => <article key={value(asset, "assetId")} className="asset-catalog-row">
              <div><span>{typeLabel(asset.assetType)}</span><em data-status={value(asset, "status")}>{statusLabel(asset.status)}</em></div>
              <strong>{value(asset, "assetName")}</strong><small>{value(asset, "assetCode")} · {value(asset, "modelName")}</small>
              <dl><div><dt>시리얼</dt><dd>{value(asset, "serialNumber")}</dd></div><div><dt>통합 UUID</dt><dd>{value(asset, "assetId")}</dd></div><div><dt>관리기관</dt><dd>{value(asset, "ownerOrgCode")}</dd></div></dl>
            </article>)}
            {!loading && filteredAssets.length === 0 && <p className="asset-catalog-empty">조건에 맞는 등록 자산이 없습니다.</p>}
            {loading && <p className="asset-catalog-empty">자산 원장을 불러오는 중입니다.</p>}
          </div>
        </section>
        <form className="asset-registration-form" onSubmit={submit}>
          <header><small>신규 자산</small><strong>자산 사전등록</strong><span>재난 프로젝트 배정은 선택 사항입니다.</span></header>
          <div className="asset-form-grid">
            <label><span>자산관리번호 <b>필수</b></span><input value={form.assetCode} onChange={(event) => setForm({ ...form, assetCode: event.target.value })} placeholder="예: UAV-ULSAN-001" required /></label>
            <label><span>자산 유형 <b>필수</b></span><select value={form.assetType} onChange={(event) => updateType(event.target.value)}>{ASSET_TYPES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
            <label className="wide"><span>자산명 <b>필수</b></span><input value={form.assetName} onChange={(event) => setForm({ ...form, assetName: event.target.value })} placeholder="운영자가 식별할 장비명" required /></label>
            <label><span>제조사</span><input value={form.manufacturer} onChange={(event) => setForm({ ...form, manufacturer: event.target.value })} placeholder="제조사명" /></label>
            <label><span>모델명</span><input value={form.modelName} onChange={(event) => setForm({ ...form, modelName: event.target.value })} placeholder="제품 모델명" /></label>
            <label><span>시리얼번호 <b>필수</b></span><input value={form.serialNumber} onChange={(event) => setForm({ ...form, serialNumber: event.target.value })} placeholder="장비 실물 시리얼" required /></label>
            <label><span>관리기관 코드</span><input value={form.ownerOrgCode} onChange={(event) => setForm({ ...form, ownerOrgCode: event.target.value })} placeholder="예: FOREST-ICT" /></label>
            <label className="wide"><span>재난 프로젝트 배정 <b>선택</b></span><select value={form.eventId} onChange={(event) => setForm({ ...form, eventId: event.target.value })}><option value="">배정하지 않음 — 전역 자산으로만 등록</option>{events.map((item) => <option key={item.eventId} value={item.eventId}>{item.eventName ?? item.eventCode ?? item.eventId} · {item.status ?? "상태 미정"}</option>)}</select></label>
            {form.eventId && <label className="wide"><span>투입 임무</span><input value={form.mission} onChange={(event) => setForm({ ...form, mission: event.target.value })} placeholder="예: 산불 현장 영상 정찰 및 통신 중계" /></label>}
            {DRONE_ASSET_TYPES.has(form.assetType) && <>
              <label className="wide">
                <span>영상 채널 주소 <b>선택</b></span>
                <input
                  value={form.videoStreamUri}
                  onChange={(event) => setForm({ ...form, videoStreamUri: event.target.value })}
                  placeholder="rtsp://장비주소:포트/경로"
                  inputMode="url"
                />
                <small>영상 원본이 아닌 접속 주소만 저장합니다. rstp 오타는 rtsp로 자동 교정됩니다.</small>
              </label>
              {form.videoStreamUri.trim() && <label className="wide asset-video-channel-option">
                <input
                  type="checkbox"
                  checked={form.videoChannelEnabled}
                  onChange={(event) => setForm({ ...form, videoChannelEnabled: event.target.checked })}
                />
                <span>등록 후 이 영상 채널 사용</span>
              </label>}
            </>}
          </div>
          <fieldset><legend>장비 기능 <b>필수</b></legend><div className="asset-capability-grid">{CAPABILITIES.map((capability) => <label key={capability} data-selected={form.capabilities.includes(capability)}><input type="checkbox" checked={form.capabilities.includes(capability)} onChange={() => toggleCapability(capability)} /><span>{capability}</span></label>)}</div></fieldset>
          <aside><strong>식별 원칙</strong><span>UUID는 시스템 통합키로 자동 발급합니다. 자산관리번호와 시리얼번호는 실물 대조 및 증빙용으로 함께 유지합니다.</span></aside>
          <label className="asset-credential-option" data-selected={issueCredential}>
            <input type="checkbox" checked={issueCredential} onChange={(event) => setIssueCredential(event.target.checked)} />
            <span><strong>등록과 동시에 장비 인증키 발급</strong><small>GNSS 어댑터가 활성화 토큰을 요청할 때 사용하는 비밀키입니다.</small></span>
          </label>
          {issuedCredential && <section className="asset-credential-result" aria-label="발급된 장비 인증키">
            <div><strong>장비 인증키가 발급되었습니다</strong><span>보안을 위해 지금 한 번만 표시됩니다.</span></div>
            <dl><div><dt>자산 UUID</dt><dd>{issuedCredential.assetId}</dd></div><div><dt>인증키</dt><dd>{issuedCredential.secret}</dd></div></dl>
            <button type="button" onClick={() => void copyCredential()}>{credentialCopied ? "복사 완료" : "인증키 복사"}</button>
          </section>}
          {message && <p className="asset-form-message" data-kind={message.kind} role="status">{message.text}</p>}
          <footer><button type="button" onClick={() => { setForm(initialForm()); setMessage(null); setIssuedCredential(null); setCredentialCopied(false); }}>입력 초기화</button><button type="submit" disabled={saving}>{saving ? "등록 처리 중…" : issueCredential ? "자산 등록 및 인증키 발급" : "자산 등록 및 UUID 발급"}</button></footer>
        </form>
      </div>
    </section>
  </div>;
}
