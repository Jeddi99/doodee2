import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  MessageCircle,
  Plus,
  ScanFace,
  Search,
  Trash2,
} from "lucide-react";
import { GlassCard } from "../DashboardPage";
import {
  askChatTopic, deleteChat, getChat, getChatFacts, getChats, getScan, getScans, getSession, sendChat,
} from "../../lib/api";
import { errorMessage } from "../../lib/apiError";
import { useLocale } from "../../useLocale";

/**
 * DOODEE Chat, on qijek's chat shell.
 *
 * Three mock controls from the ported UI are gone rather than left dangling. The paperclip
 * accepted a file that had nowhere to go — and photographs in particular are the one thing
 * this feature deliberately never sends upstream (see backend/doodee/chat.py), so an attach
 * button here would advertise the opposite of what happens. The "Normal / Deep analysis"
 * toggle switched nothing; its slot in the header now shows the turns left this month, which
 * is a real number the server enforces. And "85+ measurements connected" was never true: the
 * count comes from the scan.
 */

const COPY = {
  th: {
    brand: "DOODEE Chat",
    newChat: "แชทใหม่",
    search: "ค้นหาแชท",
    recent: "ล่าสุด",
    emptyHistory: "ยังไม่มีประวัติแชท",
    emptyHistoryHint: "เริ่มคุยแล้วจะขึ้นที่นี่",
    back: "กลับหน้าหลัก",
    myAnalysis: "ผลวิเคราะห์ของฉัน",
    measurements: (count: number) => `เชื่อมกับค่าที่วัดได้ ${count} ค่า`,
    noScan: "ยังไม่มีผลสแกน",
    heading: "อยากรู้อะไรเกี่ยวกับใบหน้าของคุณ",
    subheading: "ถามเรื่องค่าที่วัดได้ ความหมายของตัวเลข และข้อจำกัดของมัน",
    placeholder: "พิมพ์คำถาม",
    send: "ส่ง",
    thinking: "กำลังคิด…",
    disclaimer: "DOODEE Chat ตอบผิดได้ การตัดสินใจทางการแพทย์ต้องปรึกษาแพทย์",
    // Said before the box, not buried in a policy page: typing a question is the one action
    // in DOODEE that sends anything outside this system.
    privacy: "คำถามที่พิมพ์เองจะถูกส่งไปยัง Anthropic พร้อมค่าที่วัดได้ 12 ค่า ภาพใบหน้าไม่ถูกส่งออกไป คำถามสำเร็จรูปด้านบนตอบจากในระบบ ไม่ส่งข้อมูลออก",
    turnsLeft: (n: number) => `เหลือ ${n} ครั้งเดือนนี้`,
    quotaTitle: "ใช้ครบโควตาเดือนนี้แล้ว",
    quotaBodyFree: "แผนฟรีคุยได้ 5 ครั้งต่อเดือน โควตาจะรีเซ็ตต้นเดือนหน้า",
    quotaBodyPaid: "ถึงเพดานการใช้งานของเดือนนี้แล้ว ติดต่อทีมงานถ้าต้องใช้เพิ่ม",
    seePlans: "ดูแผน",
    offTitle: "แชทยังไม่เปิดใช้งาน",
    offBody: "คำถามพิมพ์เองต้องเชื่อมกับผู้ให้บริการโมเดลก่อน แต่คำถามด้านบนยังกดได้ตามปกติ",
    failed: "ส่งข้อความไม่สำเร็จ",
    freeChip: "ตอบจากตัวเลข ไม่กินโควตา",
    retry: "ลองใหม่",
    deleteChat: "ลบแชทนี้",
  },
  en: {
    brand: "DOODEE Chat",
    newChat: "New chat",
    search: "Search chats",
    recent: "Recent",
    emptyHistory: "No chat history yet",
    emptyHistoryHint: "Start a conversation to see it here.",
    back: "Back to dashboard",
    myAnalysis: "My analysis",
    measurements: (count: number) => `${count} measurements connected`,
    noScan: "No scan yet",
    heading: "What would you like to know about your face?",
    subheading: "Ask about the measurements, what the numbers mean, and where they stop.",
    placeholder: "Ask anything",
    send: "Send",
    thinking: "Thinking…",
    disclaimer: "DOODEE Chat can make mistakes. Medical decisions require a qualified professional.",
    privacy: "A question you type is sent to Anthropic along with your 12 measurements. Your photos are never sent. The suggested questions above are answered inside DOODEE and send nothing.",
    turnsLeft: (n: number) => `${n} left this month`,
    quotaTitle: "You've used this month's turns",
    quotaBodyFree: "The free plan includes 5 turns a month. It resets at the start of next month.",
    quotaBodyPaid: "You've hit this month's usage ceiling. Contact us if you need more.",
    seePlans: "See plans",
    offTitle: "Chat isn't switched on",
    offBody: "Typing your own question needs a model provider. The questions above still work.",
    failed: "Message failed to send",
    freeChip: "Answered from your numbers. Does not use a turn.",
    retry: "Try again",
    deleteChat: "Delete this chat",
  },
};

type ChatMessage = { id: number; role: "user" | "assistant"; content: string; created_at: string };

export default function ChatPanel() {
  const navigate = useNavigate();
  const { locale } = useLocale();
  const copy = COPY[locale === "en" ? "en" : "th"];
  const queryClient = useQueryClient();

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [filter, setFilter] = useState("");
  // Shown immediately so the question does not vanish while the request is in flight; the
  // stored copy from the server replaces it once the turn lands.
  const [pending, setPending] = useState<string | null>(null);

  const session = useQuery({ queryKey: ["session"], queryFn: getSession });
  const scans = useQuery({ queryKey: ["scans"], queryFn: getScans });
  const scanId = scans.data?.[0]?.id;
  const scan = useQuery({ queryKey: ["scan", scanId], queryFn: () => getScan(scanId), enabled: Boolean(scanId) });
  const conversations = useQuery({ queryKey: ["chats"], queryFn: getChats });
  const conversation = useQuery({
    queryKey: ["chat", conversationId],
    queryFn: () => getChat(conversationId),
    enabled: Boolean(conversationId),
  });

  // The questions this scan can answer without a model. Free, instant, and available even when
  // chat_enabled is false — which is most of the reason they exist.
  const facts = useQuery({
    queryKey: ["chat-facts", locale, scanId],
    queryFn: () => getChatFacts(locale),
    enabled: Boolean(scanId),
  });

  const applyTurn = (data: { conversation_id: string }) => {
    setPending(null);
    setConversationId(data.conversation_id);
    queryClient.invalidateQueries({ queryKey: ["chat", data.conversation_id] });
    queryClient.invalidateQueries({ queryKey: ["chats"] });
    // The turn counter in the header comes from /session/, so it has to be refetched or it
    // keeps showing the pre-send number.
    queryClient.invalidateQueries({ queryKey: ["session"] });
  };

  const ask = useMutation({
    mutationFn: (topic: string) => askChatTopic({ topic, conversationId, scanId, lang: locale }),
    onSuccess: applyTurn,
    onError: () => setPending(null),
  });

  const send = useMutation({
    mutationFn: (message: string) => sendChat({ message, conversationId, scanId }),
    onSuccess: applyTurn,
    onError: () => setPending(null),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteChat(id),
    onSuccess: (_data, id) => {
      if (id === conversationId) setConversationId(null);
      queryClient.invalidateQueries({ queryKey: ["chats"] });
    },
  });

  const metricCount = scan.data?.analysis_data?.reference_scores?.metrics?.length ?? 0;
  const remaining = session.data?.chat_remaining ?? null;
  const chatOff = session.isSuccess && session.data?.chat_enabled === false;
  const outOfTurns = remaining === 0;
  const messages: ChatMessage[] = conversation.data?.messages ?? [];

  const recent = useMemo(() => {
    const items = conversations.data ?? [];
    const needle = filter.trim().toLowerCase();
    return needle ? items.filter((item: { title: string }) => item.title.toLowerCase().includes(needle)) : items;
  }, [conversations.data, filter]);

  const busy = send.isPending || ask.isPending;

  const submit = (text = value) => {
    const clean = text.trim();
    if (!clean || busy || outOfTurns || chatOff) return;
    setValue("");
    setPending(clean);
    send.mutate(clean);
  };

  // Chips never check chatOff or the quota: they cost nothing and the server does not meter
  // them, so disabling them would withhold answers for no reason.
  const askTopic = (topic: string, question: string) => {
    if (busy) return;
    setPending(question);
    ask.mutate(topic);
  };

  return (
    <div className="app-view gpt-view">
      <GlassCard className="gpt-history">
        <header>
          <div className="gpt-mini-brand">
            <ScanFace />
            <strong>{copy.brand}</strong>
          </div>
          <button type="button" onClick={() => { setConversationId(null); setPending(null); }}>
            <Plus /> {copy.newChat}
          </button>
        </header>
        <label>
          <Search />
          <input
            placeholder={copy.search}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            aria-label={copy.search}
          />
        </label>
        <span className="eyebrow">{copy.recent}</span>
        {recent.length ? (
          recent.map((item: { id: string; title: string; message_count: number }) => (
            <button
              className={`gpt-history-item ${item.id === conversationId ? "is-active" : ""}`}
              type="button"
              key={item.id}
              onClick={() => { setConversationId(item.id); setPending(null); }}
            >
              <MessageCircle />
              <span>
                <strong>{item.title}</strong>
                <small>{item.message_count}</small>
              </span>
              <i
                role="button"
                tabIndex={0}
                aria-label={copy.deleteChat}
                onClick={(event) => { event.stopPropagation(); remove.mutate(item.id); }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") { event.stopPropagation(); remove.mutate(item.id); }
                }}
              >
                <Trash2 />
              </i>
            </button>
          ))
        ) : (
          <div className="gpt-history-empty">
            <MessageCircle />
            <p>{copy.emptyHistory}</p>
            <small>{copy.emptyHistoryHint}</small>
          </div>
        )}
        <a href="/app#overview">
          <ArrowLeft /> {copy.back}
        </a>
      </GlassCard>

      <GlassCard className="gpt-chat">
        <header>
          <span className="gpt-mode" aria-live="polite">
            {remaining === null ? "" : copy.turnsLeft(remaining)}
          </span>
          <div>
            {scan.data?.front_url ? <img src={scan.data.front_url} alt={copy.myAnalysis} /> : null}
            <span>
              <strong>{copy.myAnalysis}</strong>
              <small>{metricCount ? copy.measurements(metricCount) : copy.noScan}</small>
            </span>
          </div>
        </header>

        <div className={`gpt-conversation ${messages.length || pending ? "has-messages" : ""}`}>
          {messages.length || pending ? (
            <>
              {messages.map((message) => (
                <div className={`gpt-message is-${message.role}`} key={message.id}>
                  {message.role === "assistant" && (
                    <span>
                      <ScanFace />
                    </span>
                  )}
                  <p>{message.content}</p>
                </div>
              ))}
              {pending ? (
                <div className="gpt-message is-user">
                  <p>{pending}</p>
                </div>
              ) : null}
              {busy ? (
                <div className="gpt-message is-assistant" aria-live="polite">
                  <span>
                    <ScanFace />
                  </span>
                  <p>{copy.thinking}</p>
                </div>
              ) : null}
              {send.error || ask.error ? (
                <div className="gpt-message is-assistant" role="alert">
                  <span>
                    <ScanFace />
                  </span>
                  <p>
                    {copy.failed} — {errorMessage(send.error || ask.error)}
                  </p>
                </div>
              ) : null}
            </>
          ) : (
            <div className="gpt-empty">
              <div className="gpt-orb">
                <MessageCircle />
              </div>
              <span className="eyebrow">{copy.brand}</span>
              <h1>{copy.heading}</h1>
              <p>{copy.subheading}</p>
              <div className="gpt-suggestions">
                {(facts.data?.topics ?? []).map((item: { topic: string; question: string }) => (
                  <button
                    type="button"
                    onClick={() => askTopic(item.topic, item.question)}
                    key={item.topic}
                    disabled={busy}
                  >
                    {item.question}
                    <ArrowRight />
                  </button>
                ))}
              </div>
              {facts.data?.topics?.length ? <small className="gpt-free-note">{copy.freeChip}</small> : null}
            </div>
          )}
        </div>

        {/* Also below the transcript, not only on the empty state. Otherwise the first answer
            hides every remaining free question — and with chat_enabled false that is a dead
            end, since the composer is replaced too. */}
        {(messages.length > 0 || pending) && (facts.data?.topics?.length ?? 0) > 0 ? (
          <div className="gpt-followups">
            {(facts.data?.topics ?? []).map((item: { topic: string; question: string }) => (
              <button
                type="button"
                onClick={() => askTopic(item.topic, item.question)}
                key={item.topic}
                disabled={busy}
              >
                {item.question}
              </button>
            ))}
          </div>
        ) : null}

        {chatOff ? (
          <div className="gpt-quota" role="status">
            <strong>{copy.offTitle}</strong>
            <p>{copy.offBody}</p>
          </div>
        ) : outOfTurns ? (
          <div className="gpt-quota" role="status">
            <strong>{copy.quotaTitle}</strong>
            <p>{session.data?.plan === "free" ? copy.quotaBodyFree : copy.quotaBodyPaid}</p>
            {session.data?.plan === "free" ? (
              <button type="button" onClick={() => navigate("/pricing")}>
                {copy.seePlans}
              </button>
            ) : null}
          </div>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <textarea
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={copy.placeholder}
              aria-label={copy.placeholder}
              rows={1}
              maxLength={2000}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
            />
            <button type="submit" aria-label={copy.send} disabled={!value.trim() || busy}>
              <ArrowRight />
            </button>
          </form>
        )}

        <small className="gpt-disclaimer">{copy.disclaimer}</small>
        {/* Only shown where free text is actually reachable: with chat off or the quota gone
            the composer is not rendered, and nothing can leave. */}
        {!chatOff && !outOfTurns && <small className="gpt-disclaimer">{copy.privacy}</small>}
      </GlassCard>
    </div>
  );
}
