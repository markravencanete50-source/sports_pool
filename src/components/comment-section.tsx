"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Send, Loader2 } from "lucide-react";
import { CommentSectionProps } from "@/lib/interfaces";

export function CommentSection({
  comments,
  onAddComment,
  isLoading,
  isPosting = false,
  requiresCard = false,
  onPurchaseCard,
  currentUserId = null,
}: CommentSectionProps) {
  const [text, setText] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || isPosting) return;
    onAddComment(text);
    setText("");
  };

  return (
    <div className="flex flex-col h-[500px] glass-panel rounded-xl overflow-hidden">
      <div className="p-4 border-b border-white/10 bg-white/5">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          Trash Talk & Picks
        </h3>
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

            return (
              <div key={comment.id} className={`flex gap-3 ${isMe ? "flex-row-reverse" : ""}`}>
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-700 to-black border border-white/10 flex items-center justify-center text-sm shadow-sm flex-shrink-0">
                  {userAvatar}
                </div>
                <div className={`flex flex-col max-w-[80%] ${isMe ? "items-end" : "items-start"}`}>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-xs font-bold font-display tracking-wide">{userName}</span>
                    <span className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(comment.timestamp))} ago</span>
                  </div>
                  <div className={`p-3 rounded-2xl text-sm ${
                    isMe 
                      ? "bg-primary text-white rounded-tr-none" 
                      : "bg-white/5 border border-white/10 rounded-tl-none"
                  }`}>
                    {comment.text}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {requiresCard ? (
        <div className="p-4 border-t border-white/10 bg-yellow-500/10 border-yellow-500/20">
          <p className="text-sm text-yellow-500 mb-2">
            🔒 You must purchase a card to access chat
          </p>
          {onPurchaseCard && (
            <button
              onClick={onPurchaseCard}
              className="w-full py-2 px-4 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
            >
              Purchase Card to Unlock Chat
            </button>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="p-4 border-t border-white/10 bg-white/5 flex gap-2">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a message... (Don't share your card details!)"
            className="flex-1 bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50"
          />
          <button
            type="submit"
            className="p-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!text.trim() || isPosting}
          >
            {isPosting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </form>
      )}
    </div>
  );
}
