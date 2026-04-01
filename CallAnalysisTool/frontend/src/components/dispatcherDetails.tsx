"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Dispatcher, DispatcherRecord, FileParts } from "@/types/dispatcher";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import PlayerController, { PlayerControllerHandle } from "./PlayerController/PlayerController";

/* =========================
  Types
========================= */

interface DispatcherDetailsProps {
  dispatcher: Dispatcher;
  batchMode?: boolean;
}

interface BatchPage {
  dispatcherId: string;
  transcriptFilename: string;
  uploadOrder: number;
}

interface StoredBatchData {
  pages?: BatchPage[];
}

/* =========================
  Helpers
========================= */

const getFileParts = (filename: string | undefined): FileParts => {
  if (!filename) {
    return {
      name: "[name]",
      dateTime: new Date(2000, 0, 1, 0, 0, 0),
      nature: "[nature]",
      description: "[desc]",
      extension: "[ext]"
    } as FileParts;
  }

  const lastDotIndex = filename.lastIndexOf(".");
  if (lastDotIndex === -1) {
    throw new Error("Invalid filename: missing extension");
  }

  const namePart = filename.slice(0, lastDotIndex);
  const extension = filename.slice(lastDotIndex + 1);

  const parts = namePart.split("_");

  if (parts.length < 4) {
    throw new Error("Invalid filename: not enough parts");
  }

  const name = parts[0];
  const dateStr = parts[1];
  const timeStr = parts[2];
  const nature = parts[3];
  const description = parts.length > 4 ? parts.slice(4).join("_") : "";

  // Parse date (YYYYMMDD) and time (HHMMSS)
  const year = Number(dateStr.slice(0, 4));
  const month = Number(dateStr.slice(4, 6)) - 1; // JS months are 0-based
  const day = Number(dateStr.slice(6, 8));

  const hours = Number(timeStr.slice(0, 2));
  const minutes = Number(timeStr.slice(2, 4));
  const seconds = Number(timeStr.slice(4, 6));

  const dateTime = new Date(year, month, day, hours, minutes, seconds);

  return {
    name,
    dateTime,
    nature,
    description,
    extension
  } as FileParts;
}

const parseStoredDispatchers = (raw: string | null): Dispatcher[] => {
  try {
    return raw ? (JSON.parse(raw) as Dispatcher[]) : [];
  } catch {
    return [];
  }
};

const parseStoredBatchPages = (raw: string | null): BatchPage[] => {
  try {
    const parsed = raw ? (JSON.parse(raw) as StoredBatchData) : null;
    return Array.isArray(parsed?.pages) ? parsed.pages : [];
  } catch {
    return [];
  }
};

const buildFallbackPages = (dispatcher: Dispatcher): BatchPage[] => {
  const records = dispatcher.records || [];
  const grades = dispatcher.grades || {};

  return records
    .filter((record) => record.transcriptFile && grades[record.transcriptFile])
    .map((record, i) => ({
      dispatcherId: dispatcher.id,
      transcriptFilename: record.transcriptFile as string,
      uploadOrder: i,
    }));
};

const calculateOverallGrade = (
  files: string[],
  grades: Dispatcher["grades"]
): number | null => {
  const safeGrades = grades || {};
  const graded = files.filter((f) => safeGrades[f]);

  if (graded.length === 0) return null;

  const total = graded.reduce(
    (sum, f) => sum + safeGrades[f].grade_percentage,
    0
  );

  return total / graded.length;
};

const getQuestionStatusClassName = (status?: string): string => {
  switch ((status || "").trim().toLowerCase()) {
    // Grading Key:
    // 1 = Asked Correctly (100%)
    // 2 = Not Asked (0%)
    // 3 = Asked Incorrectly (0%)
    // 4 = Not As Scripted (50% - partial credit)
    // 5 = N/A (exclude from calculation)
    // 6 = Obvious (100% - full credit)
    // RC = Recorded Correctly (exclude from calculation)

    // Full credit
    case "asked correctly":
      return "text-green-600 font-semibold";
    case "obvious":
      return "text-blue-600 font-semibold";

    // No credit
    case "not asked":
    case "asked incorrectly":
      return "text-red-600 font-semibold";

    // Partial credit
    case "not as scripted":
      return "text-yellow-600 font-semibold";

    // Everything else exlcuded      
    default:
      return "text-gray-600 font-medium";
  }
};

const paginationButtonClassName =
  "inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 enabled:cursor-pointer";

/* =========================
   Component
========================= */

const DispatcherDetails = ({
  dispatcher,
  batchMode = false,
}: DispatcherDetailsProps) => {
  /* -------- State -------- */
  const [dispatchers, setDispatchers] = useState<Dispatcher[]>([]);
  const [batchPages, setBatchPages] = useState<BatchPage[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isEditingTranscript, setIsEditingTranscript] = useState(false);
  const [transcriptSaveMessage, setTranscriptSaveMessage] = useState("");
  const [isTranscriptSaving, setIsTranscriptSaving] = useState(false);
  const playerControllerRef = useRef<PlayerControllerHandle | null>(null);

  /* -------- Load localStorage -------- */
  const loadLocalData = () => {
    setDispatchers(parseStoredDispatchers(localStorage.getItem("dispatchers")));
    setBatchPages(
      parseStoredBatchPages(localStorage.getItem("latestUploadBatch"))
    );
  };

  useEffect(() => {
    loadLocalData();
    const handler = () => loadLocalData();
    window.addEventListener("dispatchersUpdated", handler);
    return () => window.removeEventListener("dispatchersUpdated", handler);
  }, []);

  /* -------- Derived Data -------- */

  const dispatcherMap = useMemo(() => {
    const map = new Map(dispatchers.map((d) => [d.id, d]));
    map.set(dispatcher.id, dispatcher);
    return map;
  }, [dispatchers, dispatcher]);

  const pagesFromBatch = useMemo(
    () =>
      batchPages.filter((p) =>
        dispatcherMap.get(p.dispatcherId)?.grades?.[p.transcriptFilename]
      ),
    [batchPages, dispatcherMap]
  );

  const activePages = useMemo(() => {
    const inBatch =
      batchMode &&
      pagesFromBatch.some((p) => p.dispatcherId === dispatcher.id);

    return inBatch ? pagesFromBatch : buildFallbackPages(dispatcher);
  }, [batchMode, pagesFromBatch, dispatcher]);

  useEffect(() => {
    if (!activePages.length) return setCurrentIndex(0);

    const idx = activePages.findIndex(
      (p) => p.dispatcherId === dispatcher.id
    );

    setCurrentIndex(idx >= 0 ? idx : 0);
  }, [dispatcher.id, activePages]);

  const safeIndex = Math.min(currentIndex, activePages.length - 1);
  const currentPage = activePages[safeIndex];

  const activeDispatcher =
    dispatcherMap.get(currentPage?.dispatcherId || "") || dispatcher;

  const records = activeDispatcher.records || [];
  const transcripts = activeDispatcher.files?.transcriptFiles || [];
  const grades = activeDispatcher.grades || {};
  const recordByTranscript = new Map<string, DispatcherRecord>(
    records
      .filter((record): record is DispatcherRecord & { transcriptFile: string } =>
        Boolean(record.transcriptFile)
      )
      .map((record) => [record.transcriptFile, record])
  );

  const currentTranscript = currentPage?.transcriptFilename;
  const currentGrade = currentTranscript
    ? grades[currentTranscript]
    : undefined;
  const questionGrades = currentGrade?.grades || currentGrade?.per_question || {};

  const currentRecord = currentTranscript
    ? recordByTranscript.get(currentTranscript)
    : undefined;
  const matchedAudio = currentRecord?.audioFile;

  const overallGrade = calculateOverallGrade(transcripts, grades);

  const handleEditButtonClick = async () => {
    if (!isEditingTranscript) {
      setTranscriptSaveMessage("");
      setIsEditingTranscript(true);
      return;
    }

    setIsTranscriptSaving(true);
    setTranscriptSaveMessage("");

    try {
      const saved = await playerControllerRef.current?.saveTranscriptChanges();
      if (saved) {
        setTranscriptSaveMessage("Transcript saved.");
      } else {
        setTranscriptSaveMessage("Failed to save transcript.");
      }
    } catch (error) {
      console.error("Error saving transcript:", error);
      setTranscriptSaveMessage("Failed to save transcript.");
    } finally {
      setIsTranscriptSaving(false);
      setIsEditingTranscript(false);
    }
  };

  /* =========================
     UI
  ========================= */

  return (
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <Link href="/records" className="text-blue-500 hover:underline">
          ← Back to Dispatchers
        </Link>

        <h1 className="text-3xl font-bold mt-4">
          {activeDispatcher.name}
        </h1>

        {overallGrade !== null && (
          <p className="text-blue-600 font-semibold">
            Overall Grade: {overallGrade.toFixed(1)}%
          </p>
        )}

        <p className="text-gray-500">
          Dispatcher ID: {activeDispatcher.id}
        </p>

        {/* Pagination */}
        {activePages.length > 1 && (
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={() => setCurrentIndex((i) => Math.max(i - 1, 0))}
              disabled={safeIndex === 0}
              className={paginationButtonClassName}
            >
              Previous
            </button>

            <span>
              {safeIndex + 1} / {activePages.length}
            </span>

            <button
              onClick={() =>
                setCurrentIndex((i) =>
                  Math.min(i + 1, activePages.length - 1)
                )
              }
              disabled={safeIndex === activePages.length - 1}
              className={paginationButtonClassName}
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Transcript */}
        <Card>
          <CardHeader>
            <CardTitle>Question Grades</CardTitle>
            Nature Code: {getFileParts(currentTranscript).nature}
            <CardDescription>{currentTranscript}</CardDescription>
          </CardHeader>
          <CardContent>
            {currentGrade ? (
              <div className="space-y-2">
                <p className="text-blue-600">
                  {currentGrade.grade_percentage}%
                </p>

                {Object.entries(questionGrades).map(
                  ([k, q]) => (
                    <div key={k} className="flex justify-between text-sm">
                      <span>{q.label}</span>
                      <span className={getQuestionStatusClassName(q.status)}>
                        {q.status}
                      </span>
                    </div>
                  )
                )}
              </div>
            ) : (
              <p className="text-gray-500">
                No transcript/grade available
              </p>
            )}
          </CardContent>
        </Card>

        {/* Audio */}
        <Card>
          <CardHeader>
            <CardTitle>Audio and Transcript</CardTitle>
            Timestamp: {`${getFileParts(matchedAudio).dateTime.toLocaleDateString()}, ${getFileParts(matchedAudio).dateTime.toLocaleTimeString()
              }`}
            <CardDescription>{matchedAudio}</CardDescription>
          </CardHeader>

          <CardContent>              
            <div className="mb-4 flex justify-end">
              <button
                type="button"
                onClick={handleEditButtonClick}
                disabled={!currentTranscript || isTranscriptSaving}
                className={paginationButtonClassName}
              >
                {isTranscriptSaving
                  ? "Saving..."
                  : isEditingTranscript
                    ? "Save Edits"
                    : "Edit Transcript"}
              </button>
            </div>

            {matchedAudio ? (
              <>
                <PlayerController
                  ref={playerControllerRef}
                  transcriptFile={currentTranscript}
                  audioFile={matchedAudio}
                  editable={isEditingTranscript}
                />
                {transcriptSaveMessage ? (
                  <p
                    className={`mt-3 text-sm ${
                      transcriptSaveMessage.toLowerCase().includes("failed")
                        ? "text-red-600"
                        : "text-green-600"
                    }`}
                  >
                    {transcriptSaveMessage}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-gray-500">No audio available</p>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
};

export default DispatcherDetails;
