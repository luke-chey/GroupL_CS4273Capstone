"use client";
import React, { useEffect, useMemo, useState } from "react";
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
}: DispatcherDetailsProps) => {
  /* -------- State -------- */
  const [dispatchers, setDispatchers] = useState<Dispatcher[]>([]);
  const [batchPages, setBatchPages] = useState<BatchPage[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

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
          </CardHeader>

          <CardContent>
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
          </CardHeader>

          <CardContent>
            {matchedAudio ? (
              <>
                <p className="font-medium">{matchedAudio}</p>
                <PlayerController
                  transcriptFile={currentTranscript}
                  audioFile={matchedAudio}
                />
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
