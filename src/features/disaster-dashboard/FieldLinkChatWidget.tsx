import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  acknowledgeFieldLinkAlert,
  getFieldLinkAlerts,
  getFieldLinkChatMessages,
  registerFieldLinkPresence,
  sendFieldLinkChatMessage,
  type FieldLinkChatMessage,
  type FieldLinkDeliveredAlert,
} from "../../http-api/fieldlink-api";
import {
  getFieldLinkConfig,
  type FieldLinkStatus,
} from "../../http-api/fieldlink-config";

import "./fieldlink-chat.css";

type Props = {
  eventId: string;
  embedded?: boolean;
};

type AlertRow =
  FieldLinkDeliveredAlert & {
    acknowledgedClientIds?: string[];
  };

function newId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

function loadClientId() {
  if (typeof window === "undefined") {
    return "fieldlink-browser";
  }

  const key = "fieldlink.client.id";
  const current = localStorage.getItem(key);

  if (current) return current;

  const created = newId();
  localStorage.setItem(key, created);

  return created;
}

function timeLabel(value: string) {
  const ms = Date.parse(value);

  if (!Number.isFinite(ms)) {
    return "--:--";
  }

  return new Date(ms).toLocaleTimeString(
    "ko-KR",
    {
      hour: "2-digit",
      minute: "2-digit",
    },
  );
}

export default function FieldLinkChatWidget({
  eventId,
  embedded = false,
}: Props) {
  const baseUrl = useMemo(
    () => getFieldLinkConfig().apiUrl,
    [],
  );

  const roomId = useMemo(
    () =>
      `event-${eventId}`
        .replace(/[^A-Za-z0-9._-]/g, "-")
        .slice(0, 64),
    [eventId],
  );

  const [clientId] = useState(loadClientId);
  const [open, setOpen] = useState(embedded);

  const [pin, setPin] = useState(
    () =>
      typeof window === "undefined"
        ? ""
        : sessionStorage.getItem(
            "fieldlink.command.pin",
          ) ?? "",
  );

  const [displayName, setDisplayName] =
    useState(
      () =>
        typeof window === "undefined"
          ? "GCS Workstation"
          : localStorage.getItem(
              "fieldlink.chat.name",
            ) ?? "GCS Workstation",
    );

  const [draft, setDraft] = useState("");
  const [messages, setMessages] =
    useState<FieldLinkChatMessage[]>([]);
  const [alerts, setAlerts] =
    useState<AlertRow[]>([]);

  const [status, setStatus] =
    useState<FieldLinkStatus>("checking");

  const [error, setError] = useState("");
  const [sending, setSending] =
    useState(false);

  useEffect(() => {
    sessionStorage.setItem(
      "fieldlink.command.pin",
      pin,
    );
  }, [pin]);

  useEffect(() => {
    localStorage.setItem(
      "fieldlink.chat.name",
      displayName,
    );
  }, [displayName]);

  useEffect(() => {
    let disposed = false;

    setStatus("checking");

    const refresh = async () => {
      try {
        await registerFieldLinkPresence(
          baseUrl,
          pin,
          {
            clientId,
            displayName:
              displayName.trim() ||
              "GCS Workstation",
          },
        );

        const [chat, alertResult] =
          await Promise.all([
            getFieldLinkChatMessages(
              baseUrl,
              pin,
              roomId,
            ),
            getFieldLinkAlerts(
              baseUrl,
              pin,
            ),
          ]);

        if (disposed) return;

        setMessages(chat.messages);
        setAlerts(alertResult.alerts);
        setStatus("online");
        setError("");
      } catch (caught) {
        if (disposed) return;

        setStatus("offline");

        setError(
          caught instanceof Error
            ? caught.message
            : "FIELDLINK_ERROR",
        );
      }
    };

    void refresh();

    const timer = window.setInterval(
      refresh,
      2000,
    );

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [
    baseUrl,
    clientId,
    displayName,
    pin,
    roomId,
  ]);

  const send = async (
    event: FormEvent,
  ) => {
    event.preventDefault();

    const text = draft.trim();
    const senderName =
      displayName.trim();

    if (
      !text ||
      !senderName ||
      sending
    ) {
      return;
    }

    setSending(true);

    try {
      const message =
        await sendFieldLinkChatMessage(
          baseUrl,
          pin,
          {
            roomId,
            senderId: clientId,
            senderName,
            text,
            clientMessageId: newId(),
          },
        );

      setMessages((current) => [
        ...current.filter(
          (row) =>
            row.messageId !==
            message.messageId,
        ),
        message,
      ]);

      setDraft("");
      setStatus("online");
      setError("");
    } catch (caught) {
      setStatus("offline");

      setError(
        caught instanceof Error
          ? caught.message
          : "CHAT_SEND_ERROR",
      );
    } finally {
      setSending(false);
    }
  };

  const acknowledge = async (
    deliveryId: string,
  ) => {
    try {
      const updated =
        await acknowledgeFieldLinkAlert(
          baseUrl,
          pin,
          deliveryId,
          {
            clientId,
            displayName:
              displayName.trim() ||
              "GCS Workstation",
          },
        );

      setAlerts((current) =>
        current.map((row) =>
          row.deliveryId === deliveryId
            ? updated
            : row,
        ),
      );

      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "ALERT_ACK_ERROR",
      );
    }
  };

  const pendingAlerts = alerts
    .filter(
      (alert) =>
        !alert.acknowledgedClientIds
          ?.includes(clientId),
    )
    .slice(-3)
    .reverse();

  return (
    <aside
      className={`fieldlink-chat-widget${embedded ? " is-embedded" : ""}`}
      aria-label="FieldLink 현장 LAN 채팅"
    >
      <button
        type="button"
        className="fieldlink-chat-toggle"
        onClick={() =>
          setOpen((value) => !value)
        }
      >
        <span>현장 채팅</span>

        <i data-state={status} />

        {pendingAlerts.length > 0 && (
          <b>{pendingAlerts.length}</b>
        )}
      </button>

      {open && (
        <section className="fieldlink-chat-panel">
          <header>
            <div>
              <strong>FieldLink</strong>
              <small>
                LAN ONLY · 백홀 불필요
              </small>
            </div>

            <span data-state={status}>
              {status === "online"
                ? "연결됨"
                : status === "checking"
                  ? "확인 중"
                  : "오프라인"}
            </span>
          </header>

          <div className="fieldlink-chat-config">
            <input
              value={displayName}
              maxLength={40}
              aria-label="채팅 사용자 이름"
              onChange={(event) =>
                setDisplayName(
                  event.target.value,
                )
              }
            />

            <input
              type="password"
              value={pin}
              placeholder="PIN"
              aria-label="FieldLink PIN"
              onChange={(event) =>
                setPin(
                  event.target.value,
                )
              }
            />
          </div>

          {pendingAlerts.length > 0 && (
            <div className="fieldlink-chat-alert-list">
              {pendingAlerts.map(
                (alert) => (
                  <article
                    key={alert.deliveryId}
                  >
                    <div>
                      <strong>
                        {alert.title}
                      </strong>

                      <small>
                        {timeLabel(
                          alert.sentAt,
                        )}
                      </small>
                    </div>

                    <p>
                      {alert.message}
                    </p>

                    <button
                      type="button"
                      onClick={() =>
                        void acknowledge(
                          alert.deliveryId,
                        )
                      }
                    >
                      확인
                    </button>
                  </article>
                ),
              )}
            </div>
          )}

          <div className="fieldlink-chat-message-list">
            {messages.length === 0 && (
              <p className="fieldlink-chat-empty">
                아직 메시지가 없습니다.
              </p>
            )}

            {messages.map((message) => {
              const mine =
                message.senderId ===
                clientId;

              return (
                <article
                  key={message.messageId}
                  className={
                    mine ? "mine" : ""
                  }
                >
                  {!mine && (
                    <strong>
                      {message.senderName}
                    </strong>
                  )}

                  <div>
                    <p>{message.text}</p>

                    <small>
                      {timeLabel(
                        message.sentAt,
                      )}
                    </small>
                  </div>
                </article>
              );
            })}
          </div>

          {error && (
            <small className="fieldlink-chat-error">
              {error}
            </small>
          )}

          <form onSubmit={send}>
            <input
              value={draft}
              maxLength={1000}
              placeholder="LAN 메시지 입력"
              onChange={(event) =>
                setDraft(
                  event.target.value,
                )
              }
            />

            <button
              type="submit"
              disabled={
                sending ||
                !draft.trim() ||
                !displayName.trim()
              }
            >
              {sending ? "..." : "전송"}
            </button>
          </form>
        </section>
      )}
    </aside>
  );
}
