"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Send, Loader2, Flag, ShieldCheck, Timer } from "lucide-react";
import { CommentSectionProps } from "@/lib/interfaces";

/**
 * Pool chat panel.
 *
 * Three states before a message can be typed, mirroring the server's order:
 *   1. no card / not a participant  → purchase prompt
 *   2. chat rules not yet accepted   → the click-to-message agreement
 *   3. slow-mode cooldown running    → composer disabled with a countdown
 * The server refuses a post in every one of those cases whether or not this
 * component agrees; the UI only explains the refusal before it happens.
 */
export function CommentSection({
  comments,
  onAddComment,
  isLoading,
  isPosting = false,
  requiresCard = false,
  onPurchaseCard,
  currentUserId = null,
  rules = null,
  onAcceptRules,
  isAcceptingRules = false,
  cooldownSeconds = 0,
  slowModeSeconds = 0,
  onReport,
}: CommentSectionProps) {
  const [text, setText] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [reporting, setReporting] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [remaining, setRemaining] = useState(0);

  // Countdown driven by the last server-imposed cooldown.
  useEffect(() => {
    if (!cooldownSeconds) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the countdown is seeded from a server response (429 Retry-After), which is genuine external state
    setRemaining(cooldownSeconds);
    const timer = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(timer);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  const rulesPending = !!rules && !rules.accepted;
  const composerDisabled = isPosting || remaining > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || composerDisabled) return;
    onAddComment(text);
    setText("");
  };

  const submitReport = async (commentId: string) => {
    if (!onReport || reportReason.trim().length < 3) return;
    await onReport(commentId, reportReason.trim());
    setReporting(null);
    setReportReason("");
  };

  return (
    <div className="flex flex-col h-[520px] glass-panel rounded-xl overflow-hidden">
      <div className="p-4 border-b border-white/10 bg-white/5 flex items-center justify-between gap-2">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          Trash Talk & Picks
        </h3>
        {slowModeSeconds > 0 && (
          <span
            className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1"
            title="Slow mode: one message per interval"
          >
            <Timer className="w-3 h-3" /> {slowModeSeconds}s slow mode
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : comments.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm italic">
            No comments yet. Start the conversation!
          </div>
        ) : (
          comments.map((comment) => {
            const userName = comment.user?.name || "Unknown";
            const userAvatar = comment.user?.avatar || "?";
            const isMe = !!currentUserId && comment.userId === currentUserId;
            const isReporting = reporting === comment.id;

            return (
              <div key={comment.id} className={`flex gap-3 ${isMe ? "flex-row-reverse" : ""}`}>
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-700 to-black border border-white/10 flex items-center justify-center text-sm shadow-sm flex-shrink-0">
                  {userAvatar}
                </div>
                <div className={`flex flex-col max-w-[80%] ${isMe ? "items-end" : "items-start"}`}>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-xs font-bold font-display tracking-wide">{userName}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(comment.timestamp))} ago
                    </span>
                    {!isMe && onReport && !isReporting && (
                      <button
                        type="button"
                        onClick={() => {
                          setReporting(comment.id);
                          setReportReason("");
                        }}
                        className="text-[10px] text-muted-foreground hover:text-red-400 flex items-center gap-0.5"
                        aria-label="Report this message"
                        title="Report this message"
                      >
                        <Flag className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <div
                    className={`p-3 rounded-2xl text-sm ${
                      isMe
                        ? "bg-primary text-white rounded-tr-none"
                        : "bg-white/5 border border-white/10 rounded-tl-none"
                    }`}
                  >
                    {comment.text}
                  </div>
                  {isReporting && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void submitReport(comment.id);
                      }}
                      className="mt-2 w-full flex flex-col gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-2"
                    >
                      <label htmlFor={`report-${comment.id}`} className="text-[10px] uppercase font-mono text-red-300">
                        Why are you reporting this?
                      </label>
                      <input
                        id={`report-${comment.id}`}
                        value={reportReason}
                        onChange={(e) => setReportReason(e.target.value)}
                        maxLength={500}
                        placeholder="e.g. sharing picks, abuse, spam"
                        className="bg-black/30 border border-white/10 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-red-400"
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => setReporting(null)}
                          className="text-xs px-2 py-1 rounded border border-white/10 hover:bg-white/10"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={reportReason.trim().length < 3}
                          className="text-xs px-2 py-1 rounded bg-red-600 text-white disabled:opacity-50"
                        >
                          Send report
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {requiresCard ? (
        <div className="p-4 border-t border-white/10 bg-yellow-500/10 border-yellow-500/20">
          <p className="text-sm text-yellow-500 mb-2">🔒 You must purchase a card to access chat</p>
          {onPurchaseCard && (
            <button
              onClick={onPurchaseCard}
              className="w-full py-2 px-4 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
            >
              Purchase Card to Unlock Chat
            </button>
          )}
        </div>
      ) : rulesPending ? (
        <div className="p-4 border-t border-white/10 bg-white/5 space-y-3">
          <p className="text-sm font-bold flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" /> Before you post
          </p>
          <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
            <li>Do not discuss the specifics of your picks or anyone else&apos;s.</li>
            <li>Do not share card numbers, screenshots or predictions.</li>
            <li>Keep it civil. Messages are filtered and moderated; repeat violations can disqualify you.</li>
          </ul>
          <label className="flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5"
            />
            <span>I agree not to discuss the specifics of my picks in chat.</span>
          </label>
          <button
            type="button"
            disabled={!agreed || isAcceptingRules || !onAcceptRules}
            onClick={() => rules && onAcceptRules?.(rules.version)}
            className="w-full py-2 px-4 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium disabled:opacity-50"
          >
            {isAcceptingRules ? "Saving…" : "Accept and start chatting"}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="p-4 border-t border-white/10 bg-white/5 flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                remaining > 0
                  ? `Slow mode — you can post again in ${remaining}s`
                  : "Type a message... (Don't share your card details!)"
              }
              disabled={remaining > 0}
              maxLength={500}
              className="flex-1 bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50 disabled:opacity-60"
            />
            <button
              type="submit"
              className="p-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!text.trim() || composerDisabled}
              aria-label="Send message"
            >
              {isPosting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
