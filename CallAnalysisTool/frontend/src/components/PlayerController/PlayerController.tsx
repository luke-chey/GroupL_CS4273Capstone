"use client";
import styles from "./PlayerController.module.css";
import { AudioPlayer } from "../AudioPlayer/AudioPlayer";
import { useEffect, useState } from "react";
import { TranscriptPlayer } from "../TranscriptPlayer/TranscriptPlayer";
import {
  buildBackendFileUrl,
  fetchBackendFile,
} from "@/lib/api";

interface TranscriptSegment {
  speaker?: string;
  text?: string;
  start: number;
  end: number;
}

interface TranscriptData {
  segments?: TranscriptSegment[];
}

interface PlayerControllerProps {
  transcriptFile?: string;
  audioFile?: string;
}

export default function PlayerController({
  transcriptFile,
  audioFile,
}: PlayerControllerProps) {
  // states
  const [fileName, setFileName] = useState("N/A");
  const [fileURL, setFileURL] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<TranscriptData | null>(
    null
  );
  const [currentTime, setCurrentTime] = useState(0);
  const [transcriptionLoaded, setTranscriptionLoaded] = useState(false);

  // Load exact backend record files when provided
  useEffect(() => {
    if (!transcriptFile) {
      return;
    }

    setTranscriptionLoaded(false);
    setTranscription(null);
    setCurrentTime(0);

    fetchBackendFile<TranscriptData>(transcriptFile)
      .then((data) => {
        setTranscription(data);
        setTranscriptionLoaded(true);
        setFileName(audioFile || transcriptFile);
        setFileURL(audioFile ? buildBackendFileUrl(audioFile) : null);
      })
      .catch((error) => {
        console.error("Error loading transcription:", error);
        setTranscriptionLoaded(false);
      });
  }, [audioFile, transcriptFile]);

  // handlers
  const handleGetFile = (name: string) => {
    setFileName(name);
    setTranscriptionLoaded(false); // Reset when manually selecting a file
  };

  const handleGetURL = (url: string) => {
    setFileURL(url);
  };

  // extracting dispatcher name from file name
  const dispatcherName = fileName.split("_")[0];

  // sends transcription data to transcript component (only for manual file selection)
  useEffect(() => {
    // Skip if transcription was already loaded from API or if no file selected
    if (transcriptionLoaded || !fileName || fileName === "N/A") return;

    // Also skip if fileName is a JSON file (should only process audio files)
    if (fileName.endsWith(".json")) return;

    // reset current time
    setCurrentTime(0);

    // converting audio file name to json
    const baseName = fileName.replace(/\.[^/.]+$/, "");
    const transcriptUrl = `/transcripts/${baseName}.json`;

    fetch(transcriptUrl)
      .then((response) => {
        if (!response.ok) {
          // Don't throw - just log and return
          console.warn(
            `Transcript not found for ${fileName} at ${transcriptUrl}`
          );
          return null;
        }
        return response.json();
      })
      .then((data) => {
        if (data) {
          setTranscription(data);
        }
      })
      .catch((error) => {
        // Catch any errors and log them instead of crashing
        console.error("Error fetching transcript:", error);
      });
  }, [fileName, transcriptionLoaded]); // Added transcriptionLoaded to dependencies

  return (
    <>
      <div className={styles.presentation_header}>

      </div>
      <TranscriptPlayer
        transcriptData={transcription || undefined}
        currentTime={currentTime}
      />
      <AudioPlayer path={fileURL || undefined} onProgress={setCurrentTime} />
    </>
  );
}
