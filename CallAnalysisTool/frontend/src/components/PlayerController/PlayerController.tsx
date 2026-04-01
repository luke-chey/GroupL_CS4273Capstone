"use client";

import styles from "./PlayerController.module.css";
import { AudioPlayer } from "../AudioPlayer/AudioPlayer";
import { useEffect, useState } from "react";
import { TranscriptPlayer } from "../TranscriptPlayer/TranscriptPlayer";

interface TranscriptSegment {
  speaker?: string;
  text?: string;
  start: number;
  end: number;
}

interface TranscriptData {
  segments?: TranscriptSegment[];
  audio_file?: string;
}

interface PlayerControllerProps {
  transcriptionId: string;
}

export default function PlayerController({ transcriptionId }: PlayerControllerProps) {
  const [fileName, setFileName] = useState("N/A");
  const [fileURL, setFileURL] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<TranscriptData | null>(null);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    if (!transcriptionId) return;

    setTranscription(null);
    setCurrentTime(0);

    fetch(`http://localhost:5001/api/transcriptions/${transcriptionId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch transcription");
        return res.json();
      })
      .then((data) => {
        const transcript = data.data ?? data;
        setTranscription(transcript);

        if (data.audio_file) {
          const audioUrl = `http://localhost:5001/api/output/${data.audio_file}`;
          setFileURL(audioUrl);

          const name = data.audio_file.split("/").pop() || "audio.wav";
          setFileName(name);
        }
      })
      .catch((err) => {
        console.error("Error loading transcription:", err);
      });
  }, [transcriptionId]);

  // Extract dispatcher name from filename
  const dispatcherName = fileName.includes("_")
    ? fileName.split("_")[0]
    : "Dispatcher";

  return (
    <>
      <div className={styles.presentation_header}>
        <p><strong>Dispatcher: </strong>{dispatcherName}</p>
        <p><strong>Audio File: </strong>{fileName}</p>
      </div>

      {/* READ-ONLY player (editing handled in DispatcherDetails) */}
      <TranscriptPlayer
        transcriptData={transcription || undefined}
        currentTime={currentTime}
        dispatcherName={dispatcherName}
      />

      <AudioPlayer
        path={fileURL || undefined}
        onProgress={setCurrentTime}
      />
    </>
  );
}