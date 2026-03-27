"use client";
import styles from "./PlayerController.module.css";
import { AudioPlayer } from "../AudioPlayer/AudioPlayer";
import { useEffect, useState } from "react";
import { TranscriptPlayer } from "../TranscriptPlayer/TranscriptPlayer";

interface PlayerControllerProps {
  transcriptionId?: string;
}

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

export default function PlayerController({ transcriptionId }: PlayerControllerProps) {
  const [fileName, setFileName] = useState("N/A");
  const [fileURL, setFileURL] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<TranscriptData | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [transcriptionLoaded, setTranscriptionLoaded] = useState(false);

  // Load transcription when transcriptionId is provided
  useEffect(() => {
    if (transcriptionId) {
      setTranscriptionLoaded(false);
      setTranscription(null);

      fetch(`http://localhost:5001/api/transcriptions/${transcriptionId}`)
        .then((res) => {
          if (!res.ok) throw new Error("Failed to fetch transcription");
          return res.json();
        })
        .then((data) => {
          if (data.success && data.data) {
            setTranscription(data.data);
            setTranscriptionLoaded(true);
            if (data.audio_file) {
              setFileURL(`http://localhost:5001/api/output/${data.audio_file}`);
              const audioFileName = data.audio_file.split("/").pop() || data.filename;
              if (audioFileName.endsWith(".json")) {
                const audioFileFromData = data.data.audio_file;
                setFileName(
                  audioFileFromData
                    ? audioFileFromData.split("/").pop() || audioFileName.replace(".json", ".wav")
                    : audioFileName.replace(".json", ".wav")
                );
              } else {
                setFileName(audioFileName);
              }
            } else if (data.filename) {
              setFileName(
                data.filename.endsWith(".json")
                  ? data.filename.replace(".json", ".wav")
                  : data.filename
              );
            }
          }
        })
        .catch((err) => {
          console.error("Error loading transcription:", err);
          setTranscriptionLoaded(false);
        });
    }
  }, [transcriptionId]);

  // Extract dispatcher name from filename for display
  const match = fileName.match(/.*_(.+)\.[^.]+$/);
  const dispatcherName = match ? match[1] : "N/A";

  // Load transcript from public folder for manual file selection
  useEffect(() => {
    if (transcriptionLoaded || !fileName || fileName === "N/A") return;
    if (fileName.endsWith(".json")) return;

    setCurrentTime(0);
    const baseName = fileName.replace(/\.[^/.]+$/, "");
    const transcriptUrl = `/transcripts/${baseName}.json`;

    fetch(transcriptUrl)
      .then((res) => {
        if (!res.ok) {
          console.warn(`Transcript not found at ${transcriptUrl}`);
          return null;
        }
        return res.json();
      })
      .then((data) => { if (data) setTranscription(data); })
      .catch((err) => console.error("Error fetching transcript:", err));
  }, [fileName, transcriptionLoaded]);

  return (
    <>
      <div className={styles.presentation_header}>
        <p><strong>Dispatcher: </strong>{dispatcherName}</p>
        <p><strong>Audio File: </strong>{fileName}</p>
      </div>
      {/* No onEditSegment prop — read-only */}
      <TranscriptPlayer
        transcriptData={transcription}
        currentTime={currentTime}
        dispatcherName={dispatcherName}
      />
      <AudioPlayer path={fileURL || undefined} onProgress={setCurrentTime} />
    </>
  );
}