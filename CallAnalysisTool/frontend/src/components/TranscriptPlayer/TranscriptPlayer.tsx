"use client";
import styles from "./TranscriptPlayer.module.css";
import { useRef, useEffect, useState } from "react";

interface TranscriptSegment {
  speaker?: string;
  text?: string;
  start: number;
  end: number;
}

interface TranscriptData {
  segments?: TranscriptSegment[];
}

interface TranscriptPlayerProps {
  transcriptData?: TranscriptData | string | null;
  currentTime: number;
  // When provided, Edit buttons are shown. When absent, read-only.
  onEditSegment?: (index: number, speaker: string, text: string) => void;
  
  dispatcherName?: string;
}

function TranscriptPlayer({
  transcriptData,
  currentTime,
  onEditSegment,
  dispatcherName,
}: TranscriptPlayerProps) {
  const chatBoxRef = useRef<HTMLDivElement>(null);

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editSpeaker, setEditSpeaker] = useState("");
  const [editText, setEditText] = useState("");

  const segments = (transcriptData as TranscriptData)?.segments ?? [];
<<<<<<< HEAD
  const messages = segments.map((segment: TranscriptSegment, index: number) => ({
    id: index,
    speaker: segment.speaker || "unknown",
    text: segment.text ? segment.text.trim() : "",
    start: segment.start,
    end: segment.end,
  }));
=======
  console.log(segments);
  const messages = segments.map(
    (segment: TranscriptSegment, index: number) => ({
      id: index,
      speaker: segment.speaker || "unknown",
      text: segment.text ? segment.text.trim() : "",
      start: segment.start,
      end: segment.end,
    })
  );
>>>>>>> origin/main

  
  const displaySpeaker = (speaker: string) => {
    if (speaker === "dispatcher" && dispatcherName) return dispatcherName;
    return speaker;
  };

  const startEdit = (id: number, speaker: string, text: string) => {
    setEditingIndex(id);
    setEditSpeaker(speaker);
    setEditText(text);
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditSpeaker("");
    setEditText("");
  };

  const saveEdit = () => {
    if (editingIndex === null) return;
    onEditSegment?.(editingIndex, editSpeaker, editText);
    cancelEdit();
  };

  // Find active message based on current playback time
  let activeIndex = messages.findIndex(
    (m) => currentTime >= m.start && currentTime <= m.end
  );
  if (activeIndex === -1) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (currentTime > messages[i].end) { activeIndex = i; break; }
    }
    if (activeIndex === -1) activeIndex = 0;
  }

  // Scroll to top when transcript changes
  useEffect(() => {
    if (chatBoxRef.current) chatBoxRef.current.scrollTop = 0;
  }, [transcriptData]);

  if (segments.length === 0) {
    return <div className={styles.chatBox}>Choose a call to review</div>;
  }

  return (
    <div className={styles.chatBox}>
      <div ref={chatBoxRef} className={styles.chatInner}>
        {messages.map((message) => (
          <div
            key={message.id}
            className={`${styles.messageRow} ${message.speaker === "caller" ? styles.right : styles.left}`}
          >
            <div
              className={`
                ${styles.bubble}
                ${message.speaker === "caller" ? styles.callerBubble : styles.dispatcherBubble}
                ${message.id === activeIndex ? styles.activeBubble : ""}
              `}
            >
              {editingIndex === message.id ? (
                <>
                  <div className={styles.speaker}>Editing Segment</div>

                  <select
                    value={editSpeaker}
                    onChange={(e) => setEditSpeaker(e.target.value)}
                    className={styles.editSelect}
                  >
                    <option value="dispatcher">dispatcher</option>
                    <option value="caller">caller</option>
                    <option value="unknown">unknown</option>
                  </select>

                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className={styles.editTextarea}
                    rows={4}
                  />

                  <div className={styles.editActions}>
                    <button onClick={saveEdit} className={styles.saveButton}>Save</button>
                    <button onClick={cancelEdit} className={styles.cancelButton}>Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  {/* Show real dispatcher name */}
                  <div className={styles.speaker}>{displaySpeaker(message.speaker)}</div>
                  <div>{message.text}</div>
                  {/* Only render Edit button when onEditSegment is provided */}
                  {onEditSegment && (
                    <button
                      onClick={() => startEdit(message.id, message.speaker, message.text)}
                      className={styles.editButton}
                    >
                      Edit
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export { TranscriptPlayer };