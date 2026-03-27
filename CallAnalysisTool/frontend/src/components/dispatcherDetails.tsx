"use client";
import React, { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { Dispatcher } from "@/types/dispatcher";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import PlayerController from "./PlayerController/PlayerController";
import { TranscriptPlayer } from "./TranscriptPlayer/TranscriptPlayer";

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
};

const buildFallbackPages = (dispatcher: Dispatcher): BatchPage[] => {
  const transcriptFiles = dispatcher.files?.transcriptFiles || [];
  const grades = dispatcher.grades || {};
  return transcriptFiles
    .filter((filename) => Boolean(grades[filename]))
    .map((filename, index) => ({
      dispatcherId: dispatcher.id,
      transcriptFilename: filename,
      uploadOrder: index,
    }));
};

const baseName = (filename: string) => filename.replace(/\.[^/.]+$/, "");

const calculateOverallGrade = (
  transcriptFiles: string[],
  grades: Dispatcher["grades"]
): number | null => {
  const safeGrades = grades || {};
  const gradedCount = transcriptFiles.filter((f) => Boolean(safeGrades[f])).length;
  if (gradedCount === 0) return null;
  const total = transcriptFiles.reduce((sum, f) => {
    const g = safeGrades[f];
    return g ? sum + g.grade_percentage : sum;
  }, 0);
  return total / gradedCount;
};

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
  const [dispatchers, setDispatchers] = useState<Dispatcher[]>([]);
  const [batchPages, setBatchPages] = useState<BatchPage[]>([]);
  const [currentGradeIndex, setCurrentGradeIndex] = useState(0);

  // Increment to force PlayerController remount 
  const [audioKey, setAudioKey] = useState(0);

  const loadLocalData = () => {
    setDispatchers(parseStoredDispatchers(localStorage.getItem("dispatchers")));
    setBatchPages(parseStoredBatchPages(localStorage.getItem("latestUploadBatch")));
  };

  useEffect(() => {
    loadLocalData();
    const handleUpdate = () => loadLocalData();
    window.addEventListener("dispatchersUpdated", handleUpdate);
    return () => window.removeEventListener("dispatchersUpdated", handleUpdate);
  }, []);

  const dispatcherMap = useMemo(() => {
    const map = new Map<string, Dispatcher>();
    for (const d of dispatchers) map.set(d.id, d);
    map.set(dispatcher.id, dispatcher);
    return map;
  }, [dispatchers, dispatcher]);

  const pagesFromBatch = useMemo(
    () => batchPages.filter((page) => {
      const d = dispatcherMap.get(page.dispatcherId);
      return Boolean(d?.grades?.[page.transcriptFilename]);
    }),
    [batchPages, dispatcherMap]
  );

  const activePages = useMemo(() => {
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
          ← Back to Records
        </Link>
        <h1 className="text-3xl font-bold mt-4">
          {activeDispatcher?.name || dispatcher.name}
        </h1>
        {overallGrade !== null && (
          <p className="text-lg font-semibold text-blue-600 mt-1">
            Overall Dispatcher Grade: {overallGrade.toFixed(1)}%
          </p>
        )}
        <p className="text-gray-500 mt-2">
          Dispatcher ID: {activeDispatcher?.id || dispatcher.id}
        </p>
        {activePages.length > 1 && (
          <div className="mt-4 flex items-center gap-3">
            <button
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
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Top row: Grading + Audio */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Transcript Grading */}
        <Card>
          <CardHeader>
            <CardTitle>Transcript Grading</CardTitle>
          </CardHeader>
          <CardContent>
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
              </div>
            ) : activeTranscriptFiles.length > 0 ? (
              <p className="text-gray-500">No grade available.</p>
            ) : (
              <p className="text-gray-500">No transcript files available.</p>
            )}
          </CardContent>
        </Card>

        {/* Audio File — read-only, remounts after save to show updated transcript */}
        <Card>
          <CardHeader>
            <CardTitle>Audio File</CardTitle>
            <CardDescription>
              {currentTranscriptFile ? "Synced to current graded file" : `${activeAudioFiles.length} file(s)`}
            </CardDescription>
          </CardHeader>
          <CardContent>
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
            ) : (
              <p className="text-gray-500">No audio files available.</p>
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