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
  extractVendorMapping,
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

function registrationStatusLabel(
  result: RegistrationResult | null,
) {
  return result ? "등록 완료" : "등록 전";
}

function typeDisplay(
  type: DashboardAssetType | undefined,
) {
  if (!type) return "장비 유형 미선택";
  return type.description
    ? `${type.name} · ${type.description}`
    : type.name;
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

  const selectedAssetType = useMemo(
    () =>
      assetTypes.find(
        (item) =>
          item.asset_type_id ===
          form.assetTypeId,
      ),
    [assetTypes, form.assetTypeId],
  );

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
  }, [loadAssetTypes]);

  const updateVendor = (
    vendor: DashboardVendor,
  ) => {
    setForm((current) => ({
      ...current,
      vendor,
      deviceType:
        DEVICE_TYPE_SUGGESTIONS[vendor][0],
    }));
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

  const vendorMapping =
    extractVendorMapping(
      result?.coreData,
    );

  const resetForm = () => {
    const next = initialForm();
    next.assetTypeId =
      assetTypes[0]?.asset_type_id || "";
    setForm(next);
    setResult(null);
    setMessage(null);
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

        <div className="asset-boundary-guide">
          <div>
            <b>① 장비 유형 조회</b>
            <span>
              asset_type_id를 Core에서 조회
            </span>
          </div>
          <i>→</i>
          <div>
            <b>② 등록·업체 연결</b>
            <span>
              asset + vendor mapping을 한 번에 저장
            </span>
          </div>
          <i>→</i>
          <div>
            <b>③ Core 저장 확인</b>
            <span>
              assetId + vendor mapping 저장 결과 확인
            </span>
          </div>
        </div>

        <div className="asset-registry-body">
          <section
            className="asset-catalog-panel"
            aria-label="장비 등록 상태"
          >
            <header>
              <div>
                <small>등록 흐름</small>
                <strong>
                  {registrationStatusLabel(
                    result,
                  )}
                </strong>
              </div>
              <span>
                Core 장비 등록과 업체 매핑 성공을
                기준으로 판정합니다.
              </span>
            </header>

            <div className="asset-catalog-list">
              <article className="asset-catalog-row">
                <div>
                  <span>STEP 1</span>
                  <em
                    data-status={
                      assetTypes.length
                        ? "READY"
                        : "PENDING"
                    }
                  >
                    {loadingTypes
                      ? "조회 중"
                      : assetTypes.length
                        ? "준비됨"
                        : "확인 필요"}
                  </em>
                </div>
                <strong>
                  장비 유형 조회
                </strong>
                <small>
                  GET /api/v1/dashboard/asset-types
                </small>
                <dl>
                  <div>
                    <dt>유형 수</dt>
                    <dd>
                      {assetTypes.length}개
                    </dd>
                  </div>
                </dl>
              </article>

              <article className="asset-catalog-row">
                <div>
                  <span>STEP 2</span>
                  <em
                    data-status={
                      result
                        ? "ACTIVE"
                        : "PENDING"
                    }
                  >
                    {result
                      ? "등록 완료"
                      : "대기"}
                  </em>
                </div>
                <strong>
                  물리 장비 + 업체 매핑
                </strong>
                <small>
                  POST /api/v1/dashboard/assets
                </small>
                <dl>
                  <div>
                    <dt>assetId</dt>
                    <dd>
                      {result?.assetId ?? "-"}
                    </dd>
                  </div>
                  <div>
                    <dt>Core 매핑</dt>
                    <dd>
                      {vendorMapping?.status
                        ? String(
                            vendorMapping.status,
                          )
                        : result
                          ? "등록됨"
                          : "-"}
                    </dd>
                  </div>
                </dl>
              </article>

              <article className="asset-catalog-row">
                <div>
                  <span>STEP 3</span>
                  <em
                    data-status={
                      result
                        ? "ACTIVE"
                        : "INACTIVE"
                    }
                  >
                    {result
                      ? "확인 완료"
                      : "대기"}
                  </em>
                </div>
                <strong>
                  Core 저장 결과 확인
                </strong>
                <small>
                  GET /api/v1/dashboard/assets/&#123;assetId&#125;
                </small>
                <dl>
                  <div>
                    <dt>Core 상태</dt>
                    <dd>
                      {result
                        ? String(
                            result.detail?.status ??
                            result.coreData.status ??
                            result.registrationRequest.status ??
                            "-",
                          )
                        : "-"}
                    </dd>
                  </div>
                  <div>
                    <dt>업체 매핑</dt>
                    <dd>
                      {vendorMapping?.status
                        ? String(vendorMapping.status)
                        : result
                          ? "등록됨"
                          : "-"}
                    </dd>
                  </div>
                </dl>
              </article>

              {result && (
                <article className="asset-catalog-row">
                  <div>
                    <span>등록 결과</span>
                    <em data-status="ACTIVE">
                      등록 완료
                    </em>
                  </div>
                  <strong>
                    {String(
                      result.detail?.asset_name ??
                      result.coreData.asset_name ??
                      result.registrationRequest
                        .assetName ??
                      result.registrationRequest
                        .assetCode,
                    )}
                  </strong>
                  <small>
                    {result.assetId}
                  </small>
                  <dl>
                    <div>
                      <dt>관리 코드</dt>
                      <dd>
                        {String(
                          result.detail
                            ?.asset_code ??
                            result.coreData
                              .asset_code ??
                            result
                              .registrationRequest
                              .assetCode,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>장비 유형</dt>
                      <dd>
                        {String(
                          result.detail
                            ?.asset_type?.name ??
                            result.assetTypeName ??
                            "-",
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>업체</dt>
                      <dd>
                        {result.registrationRequest.vendor}
                      </dd>
                    </div>
                  </dl>

                </article>
              )}
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
                사건 배정은 이 화면의 범위가
                아닙니다. 먼저 전역 장비와 업체
                식별자를 연결합니다.
              </span>
            </header>

            <div className="asset-form-grid">
              <label>
                <span>
                  assetCode <b>필수</b>
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
                  placeholder="예: DASH-RTK-01"
                  required
                />
              </label>

              <label>
                <span>
                  장비 유형 <b>필수</b>
                </span>
                <select
                  value={form.assetTypeId}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      assetTypeId:
                        event.target.value,
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

              <label className="wide">
                <span>장비명</span>
                <input
                  value={form.assetName}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      assetName:
                        event.target.value,
                    })
                  }
                  placeholder="예: 진화대원 RTK 단말 1호"
                />
              </label>

              <label>
                <span>상태</span>
                <select
                  value={form.status}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      status:
                        event.target.value,
                    })
                  }
                >
                  <option value="READY">
                    READY
                  </option>
                  <option value="ACTIVE">
                    ACTIVE
                  </option>
                  <option value="SUSPENDED">
                    SUSPENDED
                  </option>
                </select>
              </label>

              <label>
                <span>제품명</span>
                <input
                  value={form.productName}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      productName:
                        event.target.value,
                    })
                  }
                  placeholder="제품명"
                />
              </label>

              <label>
                <span>모델명</span>
                <input
                  value={form.modelName}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      modelName:
                        event.target.value,
                    })
                  }
                  placeholder="모델명"
                />
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
              </label>

              <label>
                <span>
                  deviceType <b>필수</b>
                </span>
                <input
                  value={form.deviceType}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      deviceType:
                        event.target.value,
                    })
                  }
                  list={`device-types-${form.vendor}`}
                  placeholder="업체 계약상의 장비 유형"
                  required
                />
                <datalist
                  id={`device-types-${form.vendor}`}
                >
                  {DEVICE_TYPE_SUGGESTIONS[
                    form.vendor
                  ].map((type) => (
                    <option
                      key={type}
                      value={type}
                    />
                  ))}
                </datalist>
              </label>

              <label>
                <span>매핑 상태</span>
                <select
                  value={form.mappingStatus}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      mappingStatus:
                        event.target
                          .value as DashboardMappingStatus,
                    })
                  }
                >
                  <option value="ACTIVE">
                    ACTIVE
                  </option>
                  <option value="PENDING">
                    PENDING
                  </option>
                  <option value="SUSPENDED">
                    SUSPENDED
                  </option>
                </select>
              </label>

              <label className="wide">
                <span>
                  상세 사양 JSON
                </span>
                <textarea
                  value={
                    form.specificationsText
                  }
                  onChange={(event) =>
                    setForm({
                      ...form,
                      specificationsText:
                        event.target.value,
                    })
                  }
                  rows={7}
                  spellCheck={false}
                  placeholder={'{"camera":"thermal"}'}
                  style={{
                    width: "100%",
                    resize: "vertical",
                  }}
                />
              </label>
            </div>

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

            <aside>
              <strong>
                업체 계약 확인
              </strong>
              <span>
                deviceType은 Vendor /register의
                검증 대상입니다. 현재 구현은
                추천값을 제공하되 직접 입력도
                허용하고, 최종 MAPPED 응답을
                사용 가능 기준으로 사용합니다.
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
                  : "등록 및 업체 연결"}
              </button>
            </footer>
          </form>
        </div>
      </section>
    </div>
  );
}
