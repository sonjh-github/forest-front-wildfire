import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  dashboardDeviceApi,
  extractRegisteredAssetId,
  type DashboardAssetDetail,
  type DashboardAssetRegistrationRequest,
  type DashboardAssetType,
  type DashboardMappingStatus,
  type DashboardRegisteredAsset,
  type DashboardVendor,
} from "../../http-api/device-registration-api";

const DEVICE_TYPE_SUGGESTIONS: Record<DashboardVendor, string[]> = {
  NDPS: [
    "TVWS_BASE",
    "TVWS_CPE",
    "TVWS_NMS",
    "BACKHAUL_ROUTER",
    "COMMUNICATION_VEHICLE",
    "OTHER",
  ],
  JININFRA: [
    "RTK_TERMINAL",
    "RTK_LPWA_GATEWAY",
    "RTK_BASE_STATION",
    "NETWORK_CONTROLLER",
    "BACKHAUL_ROUTER",
    "COMMUNICATION_VEHICLE",
    "OTHER",
  ],
};

type RegistrationForm = {
  assetCode: string;
  assetTypeId: string;
  assetName: string;
  status: string;
  productName: string;
  modelName: string;
  specificationsText: string;
  vendor: DashboardVendor;
  vendorDeviceId: string;
  deviceType: string;
  mappingStatus: DashboardMappingStatus;
};

type RegistrationResult = {
  assetId: string;
  coreData: DashboardRegisteredAsset;
  detail: DashboardAssetDetail | null;
  registrationRequest: DashboardAssetRegistrationRequest;
  assetTypeName: string;
};

type Message = {
  kind: "success" | "error";
  text: string;
};

function initialForm(): RegistrationForm {
  return {
    assetCode: "",
    assetTypeId: "",
    assetName: "",
    status: "READY",
    productName: "",
    modelName: "",
    specificationsText: "{}",
    vendor: "NDPS",
    vendorDeviceId: "",
    deviceType: DEVICE_TYPE_SUGGESTIONS.NDPS[0],
    mappingStatus: "ACTIVE",
  };
}

function errorText(
  error: unknown,
  fallback: string,
) {
  return error instanceof Error
    ? error.message
    : fallback;
}

function parseSpecifications(
  text: string,
): Record<string, unknown> {
  const trimmed = text.trim();
  if (!trimmed) return {};

  const parsed: unknown = JSON.parse(trimmed);

  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    throw new Error(
      "상세 사양은 JSON 객체 형식이어야 합니다.",
    );
  }

  return parsed as Record<string, unknown>;
}

function typeDisplay(
  type: DashboardAssetType | undefined,
) {
  if (!type) return "장비 유형 미선택";
  return type.description
    ? `${type.name} · ${type.description}`
    : type.name;
}

function recommendedDeviceType(
  vendor: DashboardVendor,
  assetTypeName = "",
) {
  const normalized = assetTypeName.toUpperCase();
  if (vendor === "JININFRA") {
    if (normalized.includes("GATEWAY") || normalized.includes("게이트웨이")) return "RTK_LPWA_GATEWAY";
    if (normalized.includes("BASE") || normalized.includes("기지국")) return "RTK_BASE_STATION";
    return "RTK_TERMINAL";
  }
  if (normalized.includes("NMS") || normalized.includes("관리")) return "TVWS_NMS";
  if (normalized.includes("CPE") || normalized.includes("단말")) return "TVWS_CPE";
  return "TVWS_BASE";
}

function suggestedAssetCode(
  vendor: DashboardVendor,
  deviceType: string,
  vendorDeviceId: string,
) {
  const suffix = vendorDeviceId.trim().replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  return [vendor === "JININFRA" ? "JIN" : "NDPS", deviceType.replace(/^(RTK_|TVWS_)/, ""), suffix || "001"]
    .filter(Boolean)
    .join("-")
    .toUpperCase();
}

export default function AssetRegistryModal({
  onClose,
  onRegistered,
}: {
  onClose: () => void;
  onRegistered?: () => void;
}) {
  const [assetTypes, setAssetTypes] =
    useState<DashboardAssetType[]>([]);
  const [registeredAssets, setRegisteredAssets] =
    useState<DashboardAssetDetail[]>([]);
  const [loadingAssets, setLoadingAssets] =
    useState(true);
  const [assetSearch, setAssetSearch] =
    useState("");
  const [loadingTypes, setLoadingTypes] =
    useState(true);
  const [saving, setSaving] =
    useState(false);
  const [message, setMessage] =
    useState<Message | null>(null);
  const [form, setForm] =
    useState<RegistrationForm>(initialForm);
  const [result, setResult] =
    useState<RegistrationResult | null>(null);
  const [showOptional, setShowOptional] = useState(false);
  const [copied, setCopied] = useState(false);

  const selectedAssetType = useMemo(
    () =>
      assetTypes.find(
        (item) =>
          item.asset_type_id ===
          form.assetTypeId,
      ),
    [assetTypes, form.assetTypeId],
  );

  const visibleAssets = useMemo(() => {
    const query = assetSearch.trim().toLowerCase();
    if (!query) return registeredAssets;
    return registeredAssets.filter((asset) => {
      const mapping = asset.vendor_mappings?.[0];
      return [asset.asset_id, asset.asset_code, asset.asset_name, asset.asset_type?.name, mapping?.vendor_code, mapping?.vendor_device_id, mapping?.device_type]
        .some((value) => String(value ?? "").toLowerCase().includes(query));
    });
  }, [assetSearch, registeredAssets]);

  const loadRegisteredAssets = useCallback(async () => {
    setLoadingAssets(true);
    try {
      const response = await dashboardDeviceApi.assets();
      setRegisteredAssets(response.data);
    } catch (error) {
      setMessage({
        kind: "error",
        text: errorText(error, "등록 장비 목록을 불러오지 못했습니다."),
      });
    } finally {
      setLoadingAssets(false);
    }
  }, []);

  const loadAssetTypes = useCallback(
    async () => {
      setLoadingTypes(true);

      try {
        const response =
          await dashboardDeviceApi.assetTypes();

        const nextTypes =
          response.data.filter(
            (item) =>
              item.enabled !== false,
          );

        setAssetTypes(nextTypes);
        setForm((current) => ({
          ...current,
          assetTypeId:
            current.assetTypeId ||
            nextTypes[0]?.asset_type_id ||
            "",
        }));
      } catch (error) {
        setMessage({
          kind: "error",
          text: errorText(
            error,
            "장비 유형을 불러오지 못했습니다.",
          ),
        });
      } finally {
        setLoadingTypes(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadAssetTypes();
    void loadRegisteredAssets();
  }, [loadAssetTypes, loadRegisteredAssets]);

  const updateVendor = (
    vendor: DashboardVendor,
  ) => {
    setForm((current) => ({
      ...current,
      vendor,
      deviceType: recommendedDeviceType(vendor, selectedAssetType?.name),
    }));
  };

  const copyAssetId = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.assetId);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const submit = async (
    event: FormEvent,
  ) => {
    event.preventDefault();
    setMessage(null);
    setResult(null);

    if (!form.assetCode.trim()) {
      setMessage({
        kind: "error",
        text: "assetCode는 필수입니다.",
      });
      return;
    }

    if (!form.assetTypeId) {
      setMessage({
        kind: "error",
        text: "장비 유형을 선택해 주세요.",
      });
      return;
    }

    if (!form.vendorDeviceId.trim()) {
      setMessage({
        kind: "error",
        text: "업체 장비번호는 필수입니다.",
      });
      return;
    }

    if (!form.deviceType.trim()) {
      setMessage({
        kind: "error",
        text: "업체 deviceType은 필수입니다.",
      });
      return;
    }

    let specifications:
      Record<string, unknown>;

    try {
      specifications =
        parseSpecifications(
          form.specificationsText,
        );
    } catch (error) {
      setMessage({
        kind: "error",
        text: errorText(
          error,
          "상세 사양 JSON을 확인해 주세요.",
        ),
      });
      return;
    }

    const payload:
      DashboardAssetRegistrationRequest = {
      assetCode: form.assetCode.trim(),
      assetTypeId: form.assetTypeId,
      assetName:
        form.assetName.trim() || null,
      status:
        form.status.trim() || "READY",
      productName:
        form.productName.trim() || null,
      modelName:
        form.modelName.trim() || null,
      specifications,
      vendor: form.vendor,
      vendorDeviceId:
        form.vendorDeviceId.trim(),
      deviceType:
        form.deviceType.trim(),
      mappingStatus:
        form.mappingStatus,
    };

    setSaving(true);

    try {
      const coreResponse =
        await dashboardDeviceApi.registerAsset(
          payload,
        );

      const assetId =
        extractRegisteredAssetId(
          coreResponse.data,
        );

      if (!assetId) {
        throw new Error(
          "Core 등록은 응답했지만 asset_id를 확인할 수 없습니다.",
        );
      }

      let detail:
        DashboardAssetDetail | null = null;

      try {
        const detailResponse =
          await dashboardDeviceApi.asset(
            assetId,
          );
        detail = detailResponse.data;
      } catch {
        detail = null;
      }

      const nextResult: RegistrationResult = {
        assetId,
        coreData: coreResponse.data,
        detail,
        registrationRequest: payload,
        assetTypeName:
          selectedAssetType?.name ??
          form.assetTypeId,
      };

      setResult(nextResult);
      await loadRegisteredAssets();

      setMessage({
        kind: "success",
        text: "물리 장비 등록과 업체 매핑이 Core에 정상 저장되었습니다.",
      });

      onRegistered?.();
    } catch (error) {
      setMessage({
        kind: "error",
        text: errorText(
          error,
          "장비 등록에 실패했습니다.",
        ),
      });
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    const next = initialForm();
    next.assetTypeId =
      assetTypes[0]?.asset_type_id || "";
    setForm(next);
    setResult(null);
    setMessage(null);
    setShowOptional(false);
    setCopied(false);
  };

  return (
    <div
      className="asset-registry-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className="asset-registry-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="asset-registry-title"
        onMouseDown={(event) =>
          event.stopPropagation()
        }
      >
        <header className="asset-registry-header">
          <div>
            <small>
              PHYSICAL DEVICE REGISTRATION
            </small>
            <h2 id="asset-registry-title">
              장비 등록 및 업체 연결
            </h2>
            <p>
              Core UUID 발급과 업체 장비번호
              연결을 한 번의 등록 동작으로
              처리합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="장비 등록 화면 닫기"
          >
            ×
          </button>
        </header>

        <div className="asset-registry-body">
          <section
            className="asset-catalog-panel"
            aria-label="등록 장비 목록"
          >
            <header>
              <div>
                <small>DEVICE LIST</small>
                <strong>등록 장비 {registeredAssets.length}대</strong>
              </div>
              <span>Core에 등록된 장비와 업체 연결 정보입니다.</span>
            </header>

            <div className="asset-catalog-filter">
              <input
                value={assetSearch}
                onChange={(event) => setAssetSearch(event.target.value)}
                placeholder="관리코드, assetId, 업체 장비번호로 검색"
                aria-label="등록 장비 검색"
              />
              <button type="button" onClick={() => void loadRegisteredAssets()} disabled={loadingAssets}>
                {loadingAssets ? "불러오는 중…" : "목록 새로고침"}
              </button>
            </div>

            <div className="asset-catalog-list">
              {loadingAssets && !registeredAssets.length && <p className="asset-catalog-empty">등록 장비를 불러오는 중입니다.</p>}
              {!loadingAssets && !visibleAssets.length && (
                <p className="asset-catalog-empty">{assetSearch ? "검색 결과가 없습니다." : "아직 등록된 장비가 없습니다. 오른쪽에서 첫 장비를 등록하세요."}</p>
              )}
              {visibleAssets.map((asset) => {
                const mapping = asset.vendor_mappings?.[0];
                return (
                  <article className="asset-catalog-row asset-device-row" key={asset.asset_id}>
                    <div>
                      <span>{asset.asset_type?.name ?? "장비"}</span>
                      <em data-status={String(mapping?.status ?? asset.status ?? "READY")}>{String(mapping?.status ?? asset.status ?? "READY")}</em>
                    </div>
                    <strong>{asset.asset_name || asset.asset_code || asset.asset_id}</strong>
                    <small>{asset.asset_id}</small>
                    <dl>
                      <div><dt>관리 코드</dt><dd>{asset.asset_code ?? "-"}</dd></div>
                      <div><dt>업체 장비번호</dt><dd>{mapping?.vendor_device_id ?? "-"}</dd></div>
                      <div><dt>업체 / 유형</dt><dd>{mapping ? `${mapping.vendor_code ?? "-"} · ${mapping.device_type ?? "-"}` : "미연결"}</dd></div>
                    </dl>
                  </article>
                );
              })}
            </div>
          </section>

          <form
            className="asset-registration-form"
            onSubmit={submit}
          >
            <header>
              <small>
                DASHBOARD REGISTRY
              </small>
              <strong>
                물리 장비 등록
              </strong>
              <span>
                빨간색 필수 항목 5개만 입력하면 Core UUID 발급과 업체 연결이 한 번에 완료됩니다.
              </span>
            </header>

            <div className="asset-required-guide">
              <strong>처음 등록하시나요?</strong>
              <span>장비 유형·업체·실제 장비번호를 입력하고 추천된 업체 장비 유형을 확인하세요. 관리코드는 아래의 자동 만들기 버튼으로 만들 수 있습니다.</span>
            </div>

            {result && (
              <section className="asset-id-result" aria-live="polite">
                <div>
                  <small>장비 등록 완료 · Core 발급 UUID</small>
                  <strong>{result.assetId}</strong>
                  <span>이 값이 통합 시스템에서 장비를 식별하는 assetId입니다.</span>
                </div>
                <button type="button" onClick={() => void copyAssetId()}>
                  {copied ? "복사됨" : "assetId 복사"}
                </button>
              </section>
            )}

            <div className="asset-form-grid">
              <label>
                <span>
                  통합 장비 관리코드 <b>필수</b>
                </span>
                <input
                  value={form.assetCode}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      assetCode:
                        event.target.value,
                    })
                  }
                  placeholder="예: JIN-RTK-GATEWAY-001"
                  required
                />
                <small>통합 시스템에서 찾기 쉬운 고유 관리번호입니다.</small>
                <button
                  className="asset-inline-action"
                  type="button"
                  onClick={() => setForm({ ...form, assetCode: suggestedAssetCode(form.vendor, form.deviceType, form.vendorDeviceId) })}
                >
                  업체 정보로 관리코드 자동 만들기
                </button>
              </label>

              <label>
                <span>
                  장비 유형 <b>필수</b>
                </span>
                <select
                  value={form.assetTypeId}
                  onChange={(event) =>
                    setForm((current) => {
                      const nextId = event.target.value;
                      const nextType = assetTypes.find((item) => item.asset_type_id === nextId);
                      return {
                        ...current,
                        assetTypeId: nextId,
                        deviceType: recommendedDeviceType(current.vendor, nextType?.name),
                      };
                    })
                  }
                  disabled={loadingTypes}
                  required
                >
                  {!assetTypes.length && (
                    <option value="">
                      장비 유형 조회 필요
                    </option>
                  )}
                  {assetTypes.map((item) => (
                    <option
                      key={item.asset_type_id}
                      value={item.asset_type_id}
                    >
                      {item.name}
                    </option>
                  ))}
                </select>
                <small>
                  {typeDisplay(
                    selectedAssetType,
                  )}
                </small>
              </label>

              <label>
                <span>
                  업체 <b>필수</b>
                </span>
                <select
                  value={form.vendor}
                  onChange={(event) =>
                    updateVendor(
                      event.target
                        .value as DashboardVendor,
                    )
                  }
                >
                  <option value="NDPS">
                    NDPS
                  </option>
                  <option value="JININFRA">
                    JININFRA
                  </option>
                </select>
              </label>

              <label>
                <span>
                  업체 장비번호 <b>필수</b>
                </span>
                <input
                  value={form.vendorDeviceId}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      vendorDeviceId:
                        event.target.value,
                    })
                  }
                  placeholder="예: RTK-TERM-001"
                  required
                />
                <small>장비 본체나 업체 시스템에서 사용하는 실제 고유번호를 입력하세요.</small>
              </label>

              <label>
                <span>
                  업체 장비 유형 <b>필수</b>
                </span>
                <select
                  value={form.deviceType}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      deviceType:
                        event.target.value,
                    })
                  }
                  required
                >
                  {DEVICE_TYPE_SUGGESTIONS[
                    form.vendor
                  ].map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
                <small>선택한 업체와 장비 유형에 맞는 값을 자동 추천합니다.</small>
              </label>
            </div>

            <button className="asset-optional-toggle" type="button" onClick={() => setShowOptional((value) => !value)}>
              {showOptional ? "선택 정보 닫기" : "장비명·제품명 등 선택 정보 입력"}
            </button>

            {showOptional && (
              <div className="asset-form-grid asset-optional-grid">
                <label className="wide"><span>장비명</span><input value={form.assetName} onChange={(event) => setForm({ ...form, assetName: event.target.value })} placeholder="예: 진화대원 RTK 단말 1호" /></label>
                <label><span>제품명</span><input value={form.productName} onChange={(event) => setForm({ ...form, productName: event.target.value })} placeholder="제품명" /></label>
                <label><span>모델명</span><input value={form.modelName} onChange={(event) => setForm({ ...form, modelName: event.target.value })} placeholder="모델명" /></label>
                <label><span>장비 상태</span><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="READY">READY</option><option value="ACTIVE">ACTIVE</option><option value="SUSPENDED">SUSPENDED</option></select></label>
                <label><span>연결 상태</span><select value={form.mappingStatus} onChange={(event) => setForm({ ...form, mappingStatus: event.target.value as DashboardMappingStatus })}><option value="ACTIVE">ACTIVE</option><option value="PENDING">PENDING</option><option value="SUSPENDED">SUSPENDED</option></select></label>
                <label className="wide"><span>상세 사양 JSON</span><textarea value={form.specificationsText} onChange={(event) => setForm({ ...form, specificationsText: event.target.value })} rows={5} spellCheck={false} placeholder={'{"camera":"thermal"}'} /></label>
              </div>
            )}

            <aside>
              <strong>
                식별 원칙
              </strong>
              <span>
                assetId UUID는 Core가
                발급합니다. 프론트는
                asset_type_id와 업체 장비번호만
                전달하며 UUID를 직접 만들지
                않습니다.
              </span>
            </aside>

            {message && (
              <p
                className="asset-form-message"
                data-kind={message.kind}
                role="status"
              >
                {message.text}
              </p>
            )}

            <footer>
              <button
                type="button"
                onClick={resetForm}
              >
                입력 초기화
              </button>
              <button
                type="submit"
                disabled={
                  saving ||
                  loadingTypes ||
                  !assetTypes.length
                }
              >
                {saving
                  ? "등록 및 연결 확인 중…"
                  : "장비 등록하고 assetId 발급"}
              </button>
            </footer>
          </form>
        </div>
      </section>
    </div>
  );
}
