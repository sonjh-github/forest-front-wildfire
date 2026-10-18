export type ExhibitionTourStage =
  | "overview"
  | "incident"
  | "positioning"
  | "communication"
  | "response";

export type ExhibitionTourStep = {
  id: ExhibitionTourStage;
  eyebrow: string;
  title: string;
  description: string;
};

export const EXHIBITION_TOUR_STEPS: ExhibitionTourStep[] = [
  {
    id: "overview",
    eyebrow: "01 · COMMAND OVERVIEW",
    title: "산림재난 통합관제",
    description: "API에서 수신한 사건과 현장 자원의 현재 상태를 요약합니다.",
  },
  {
    id: "incident",
    eyebrow: "02 · TERRAIN INTELLIGENCE",
    title: "재난 위치와 3D 지형",
    description: "등록된 재난 좌표를 중심으로 실제 DEM 지형을 확인합니다.",
  },
  {
    id: "positioning",
    eyebrow: "03 · POSITIONING",
    title: "RTK·GNSS 장비",
    description: "등록 장비의 측위 방식과 마지막 수신 위치를 확인합니다.",
  },
  {
    id: "communication",
    eyebrow: "04 · FIELD NETWORK",
    title: "통신 품질과 연결 관계",
    description: "수신된 RSSI·SNR과 확인된 토폴로지 연결만 표시합니다.",
  },
  {
    id: "response",
    eyebrow: "05 · OPERATION PICTURE",
    title: "현장 대응 종합 상황",
    description: "재난 대응에 등록된 자원의 최신 위치와 상태를 종합합니다.",
  },
];

export function isExhibitionTourStepAvailable(
  stage: ExhibitionTourStage,
  availability: {
    hasIncident: boolean;
    positioningCount: number;
    communicationCount: number;
    responseCount: number;
  },
) {
  if (stage === "overview" || stage === "incident") return availability.hasIncident;
  if (stage === "positioning") return availability.positioningCount > 0;
  if (stage === "communication") return availability.communicationCount > 0;
  return availability.responseCount > 0;
}
