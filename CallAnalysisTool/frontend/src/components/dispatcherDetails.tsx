"use client";
import React, { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { Dispatcher, DispatcherRecord } from "@/types/dispatcher";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import PlayerController from "./PlayerController/PlayerController";
import { TranscriptPlayer } from "./TranscriptPlayer/TranscriptPlayer";

/* =========================
  Types
========================= */

interface DispatcherDetailsProps {
  dispatcher: Dispatcher;
  batchMode?: boolean;
  transcriptData: any;
  setTranscriptData: React.Dispatch<React.SetStateAction<any>>;
  onEditSegment: (index: number, speaker: string, text: string) => void;
  onSaveTranscript: () => Promise<void>;
  savingTranscript: boolean;
  saveMessage: string;
  onTranscriptFileChange?: (filename: string | null) => void;
}

interface BatchPage {
  dispatcherId: string;
  transcriptFilename: string;
  uploadOrder: number;
}

interface StoredBatchData {
  pages?: BatchPage[];
}

<<<<<<< HEAD
const parseStoredDispatchers = (raw: string | null): Dispatcher[] => {
  if (!raw) return [];
  try { return JSON.parse(raw) as Dispatcher[]; } catch { return []; }
};

const parseStoredBatchPages = (raw: string | null): BatchPage[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as StoredBatchData;
    return Array.isArray(parsed.pages) ? parsed.pages : [];
  } catch { return []; }
=======
/* =========================
  Helpers
========================= */

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
>>>>>>> origin/main
};

const buildFallbackPages = (dispatcher: Dispatcher): BatchPage[] => {
  const records = dispatcher.records || [];
  const grades = dispatcher.grades || {};
<<<<<<< HEAD
  return transcriptFiles
    .filter((filename) => Boolean(grades[filename]))
    .map((filename, index) => ({
=======

  return records
    .filter((record) => record.transcriptFile && grades[record.transcriptFile])
    .map((record, i) => ({
>>>>>>> origin/main
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
<<<<<<< HEAD
  const gradedCount = transcriptFiles.filter((f) => Boolean(safeGrades[f])).length;
  if (gradedCount === 0) return null;
  const total = transcriptFiles.reduce((sum, f) => {
    const g = safeGrades[f];
    return g ? sum + g.grade_percentage : sum;
  }, 0);
  return total / gradedCount;
=======
  const graded = files.filter((f) => safeGrades[f]);

  if (graded.length === 0) return null;

  const total = graded.reduce(
    (sum, f) => sum + safeGrades[f].grade_percentage,
    0
  );

  return total / graded.length;
>>>>>>> origin/main
};

const getQuestionStatusClassName = (status?: string): string => {
  switch ((status || "").trim().toLowerCase()) {
    case "asked correctly":
      return "text-green-600 font-semibold";

    case "not asked":
    case "not as scripted":
      return "text-red-600 font-semibold";

    case "obvious":
      return "text-blue-600 font-semibold";

    case "unknown":
    case "n/a":
      return "text-yellow-600 font-semibold";
      
    default:
      return "text-gray-600 font-medium";
  }
};

/* =========================
   Component
========================= */

const DispatcherDetails = ({
  dispatcher,
  batchMode = false,
  transcriptData,
  setTranscriptData,
  onEditSegment,
  onSaveTranscript,
  savingTranscript,
  saveMessage,
  onTranscriptFileChange,
}: DispatcherDetailsProps) => {
  /* -------- State -------- */
  const [dispatchers, setDispatchers] = useState<Dispatcher[]>([]);
  const [batchPages, setBatchPages] = useState<BatchPage[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

<<<<<<< HEAD
  // Increment to force PlayerController remount 
  const [audioKey, setAudioKey] = useState(0);

=======
  /* -------- Load localStorage -------- */
>>>>>>> origin/main
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
<<<<<<< HEAD
    const map = new Map<string, Dispatcher>();
    for (const d of dispatchers) map.set(d.id, d);
=======
    const map = new Map(dispatchers.map((d) => [d.id, d]));
>>>>>>> origin/main
    map.set(dispatcher.id, dispatcher);
    return map;
  }, [dispatchers, dispatcher]);

  const pagesFromBatch = useMemo(
<<<<<<< HEAD
    () => batchPages.filter((page) => {
      const d = dispatcherMap.get(page.dispatcherId);
      return Boolean(d?.grades?.[page.transcriptFilename]);
    }),
=======
    () =>
      batchPages.filter((p) =>
        dispatcherMap.get(p.dispatcherId)?.grades?.[p.transcriptFilename]
      ),
>>>>>>> origin/main
    [batchPages, dispatcherMap]
  );

  const activePages = useMemo(() => {
<<<<<<< HEAD
    const batchContainsCurrent =
      batchMode && pagesFromBatch.some((p) => p.dispatcherId === dispatcher.id);
    return batchContainsCurrent ? pagesFromBatch : buildFallbackPages(dispatcher);
  }, [pagesFromBatch, dispatcher, batchMode]);

  useEffect(() => {
    if (activePages.length === 0) { setCurrentGradeIndex(0); return; }
    const startIndex = activePages.findIndex((p) => p.dispatcherId === dispatcher.id);
    setCurrentGradeIndex(startIndex >= 0 ? startIndex : 0);
  }, [dispatcher.id, activePages]);

  const safeIndex = activePages.length > 0
    ? Math.min(currentGradeIndex, activePages.length - 1) : 0;

  const currentPage = activePages[safeIndex];
  const activeDispatcher = currentPage ? dispatcherMap.get(currentPage.dispatcherId) : dispatcher;
  const activeTranscriptFiles = activeDispatcher?.files?.transcriptFiles || [];
  const activeAudioFiles = activeDispatcher?.files?.audioFiles || [];
  const activeGrades = activeDispatcher?.grades || {};
  const currentTranscriptFile = currentPage?.transcriptFilename;

  const currentFileGrade = currentTranscriptFile ? activeGrades[currentTranscriptFile] : undefined;

  // Tell parent which transcript file is active (for save URL)
  useEffect(() => {
    onTranscriptFileChange?.(currentTranscriptFile ?? null);
  }, [currentTranscriptFile, onTranscriptFileChange]);

  // Load transcript when selected file changes
  useEffect(() => {
    const loadTranscript = async () => {
      if (!currentTranscriptFile) return;
      try {
        const key = baseName(currentTranscriptFile);
        const res = await fetch(`http://localhost:5001/api/transcriptions/${key}`);
        if (!res.ok) throw new Error("Failed to load transcript");
        const data = await res.json();
        setTranscriptData(data.data ?? data);
      } catch (err) {
        console.error("Error loading transcript:", err);
        setTranscriptData(null);
      }
    };
    loadTranscript();
  }, [currentTranscriptFile, setTranscriptData]);

  // Extract dispatcher name from filename: 
  const dispatcherNameFromFile = useMemo(() => {
    if (!currentTranscriptFile) return activeDispatcher?.name || dispatcher.name;
    const parts = baseName(currentTranscriptFile).split("_");
    return parts.length >= 3 ? parts.slice(2).join("_") : (activeDispatcher?.name || dispatcher.name);
  }, [currentTranscriptFile, activeDispatcher, dispatcher.name]);

  // Save transcript then refresh audio box
  const handleSaveAndRegrade = useCallback(async () => {
    await onSaveTranscript();
    // Force PlayerController to remount 
    setAudioKey((k) => k + 1);
  }, [onSaveTranscript]);

  const matchedAudioFile = currentTranscriptFile
    ? activeAudioFiles.find((f) => baseName(f) === baseName(currentTranscriptFile))
    : undefined;

  const overallGrade = calculateOverallGrade(activeTranscriptFiles, activeGrades);
  const isBusy = savingTranscript;

  const statusMessage = saveMessage;
  const isError = statusMessage.toLowerCase().includes("fail") || statusMessage.toLowerCase().includes("error");

  return (
    <div className="container mx-auto p-6">
      {/* Page header */}
      <div className="mb-6">
        <Link href="/records" className="text-blue-500 hover:underline mb-4 inline-block">
=======
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
  const audioCount = records.filter((record) => Boolean(record.audioFile)).length;
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

  /* =========================
     UI
  ========================= */

  return (
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <Link href="/records" className="text-blue-500 hover:underline">
>>>>>>> origin/main
          ← Back to Records
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
<<<<<<< HEAD
              type="button"
              onClick={() => setCurrentGradeIndex((p) => Math.max(p - 1, 0))}
              disabled={safeIndex === 0}
              className="px-3 py-2 rounded-md border border-gray-300 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
            >
              Previous
            </button>
            <p className="text-sm text-gray-600">
              File {safeIndex + 1} / {activePages.length}
            </p>
            <button
              type="button"
              onClick={() => setCurrentGradeIndex((p) => Math.min(p + 1, activePages.length - 1))}
              disabled={safeIndex === activePages.length - 1}
              className="px-3 py-2 rounded-md border border-gray-300 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
=======
              onClick={() => setCurrentIndex((i) => Math.max(i - 1, 0))}
              disabled={safeIndex === 0}
              className="btn"
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
              className="btn"
>>>>>>> origin/main
            >
              Next
            </button>
          </div>
        )}
      </div>

<<<<<<< HEAD
      {/* Top row: Grading + Audio */}
=======
      {/* Main Grid */}
>>>>>>> origin/main
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Transcript */}
        <Card>
          <CardHeader>
            <CardTitle>Question Grades</CardTitle>
          </CardHeader>

          <CardContent>
<<<<<<< HEAD
            {currentFileGrade && currentTranscriptFile ? (
              <div className="space-y-4">
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-sm font-medium mb-2">{currentTranscriptFile}</p>
                  <p className="text-sm font-semibold mb-1 text-blue-600">
                    Current File Grade: {currentFileGrade.grade_percentage}%
                  </p>
                  {currentFileGrade.detected_nature_code && (
                    <p className="text-sm mb-2">
                      Detected Nature Code: {currentFileGrade.detected_nature_code}
                    </p>
                  )}
                  <ul className="space-y-1">
                    {Object.entries(currentFileGrade.per_question || {}).map(
                      ([key, question]: [string, any]) => (
                        <li key={key} className="flex justify-between text-sm">
                          <span>{question.label}</span>
                          <span className={
                            question.status === "Asked Correctly" || question.status === "Obvious"
                              ? "text-green-600 font-semibold"
                              : question.status === "Not As Scripted"
                              ? "text-yellow-500 font-semibold"
                              : "text-red-600 font-semibold"
                          }>
                            {question.status}
                          </span>
                        </li>
                      )
                    )}
                  </ul>
                </div>
=======
            {currentGrade ? (
              <div className="space-y-2">
                <p className="font-medium">{currentTranscript}</p>
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
>>>>>>> origin/main
              </div>
            ) : (
              <p className="text-gray-500">
                No transcript/grade available
              </p>
            )}
          </CardContent>
        </Card>

<<<<<<< HEAD
        {/* Audio File — read-only, remounts after save to show updated transcript */}
        <Card>
          <CardHeader>
            <CardTitle>Audio File</CardTitle>
            <CardDescription>
              {currentTranscriptFile ? "Synced to current graded file" : `${activeAudioFiles.length} file(s)`}
            </CardDescription>
=======
        {/* Audio */}
        <Card>
          <CardHeader>
            <CardTitle>Audio and Transcript</CardTitle>
>>>>>>> origin/main
          </CardHeader>

          <CardContent>
<<<<<<< HEAD
            {matchedAudioFile ? (
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-sm font-medium">{matchedAudioFile}</p>
                {/* Changing key forces remount,  PlayerController re-fetches from backend */}
                <PlayerController
                  key={audioKey}
                  transcriptionId={baseName(matchedAudioFile)}
                />
              </div>
            ) : currentTranscriptFile ? (
              <p className="text-gray-500">No matching audio file.</p>
            ) : activeAudioFiles.length > 0 ? (
              <p className="text-gray-500">No graded transcript selected for audio sync.</p>
=======
            {matchedAudio ? (
              <>
                <p className="font-medium">{matchedAudio}</p>
                <PlayerController
                  transcriptFile={currentTranscript}
                  audioFile={matchedAudio}
                />
              </>
>>>>>>> origin/main
            ) : (
              <p className="text-gray-500">No audio available</p>
            )}
          </CardContent>
        </Card>

      </div>

      {/* Transcript Editor */}
      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Transcript Editor</CardTitle>
            <CardDescription>
              Edit transcript text and speaker labels — audio view updates on save
            </CardDescription>
          </CardHeader>
          <CardContent>
            {currentTranscriptFile ? (
              <div className="space-y-4">
                {/* Action bar */}
                <div className="flex items-center gap-4">
                  <button
                    onClick={handleSaveAndRegrade}
                    disabled={isBusy || !transcriptData}
                    className="rounded bg-blue-600 px-5 py-2 text-white font-medium disabled:opacity-50 hover:bg-blue-700 transition-colors"
                  >
                    {savingTranscript ? "Saving..." : "Save Transcript"}
                  </button>
                  {statusMessage && (
                    <p className={`text-sm font-medium ${isError ? "text-red-600" : "text-green-600"}`}>
                      {statusMessage}
                    </p>
                  )}
                </div>

                {/* Fixed-height scrollable editor matching audio box height */}
                {transcriptData ? (
                  <div className="border border-gray-200 rounded-xl overflow-hidden" style={{ height: "500px" }}>
                    <TranscriptPlayer
                      transcriptData={transcriptData}
                      currentTime={0}
                      onEditSegment={onEditSegment}
                      dispatcherName={dispatcherNameFromFile}
                    />
                  </div>
                ) : (
                  <p className="text-gray-500">Loading transcript...</p>
                )}
              </div>
            ) : (
              <p className="text-gray-500">No transcript selected.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DispatcherDetails;