"use client";
import React, { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Dispatcher } from "@/types/dispatcher";
import DispatcherDetails from "@/components/dispatcherDetails";
import {
  fetchDispatcherRecords,
  fetchDispatcherRecordDetails,
  fetchGradeFile,
} from "@/lib/api";

function DispatcherDetailContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Batch mode is opt-in via upload redirect (`?batch=1`).
  const batchMode = searchParams.get("batch") === "1";
  const startDate = searchParams.get("startDate") || undefined;
  const endDate = searchParams.get("endDate") || undefined;
  const [dispatcher, setDispatcher] = useState<Dispatcher | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const dispatcherName = params.name as string;

    const loadDispatcher = async () => {
      setLoading(true);
      try {
        const recordNames = await fetchDispatcherRecords(dispatcherName, {
          startDate,
          endDate,
        });

        const records = (
          await Promise.all(
            recordNames.map(async (recordName) => {
              try {
                return await fetchDispatcherRecordDetails(
                  dispatcherName,
                  recordName
                );
              } catch (error) {
                console.warn(
                  `Failed to load record ${recordName} for dispatcher ${dispatcherName}:`,
                  error
                );
                return null;
              }
            })
          )
        ).filter((record): record is NonNullable<typeof record> => record !== null);

        const transcriptFiles = records
          .map((record) => record.transcriptFile)
          .filter((file): file is string => Boolean(file));
        const audioFiles = records
          .map((record) => record.audioFile)
          .filter((file): file is string => Boolean(file));
        const gradeFiles = records
          .map((record) => record.gradeFile)
          .filter((file): file is string => Boolean(file));

        // Load grades for each grade file
        const grades: Dispatcher["grades"] = {};
        await Promise.all(
          records.map(async (record) => {
            if (!record.gradeFile || !record.transcriptFile) {
              return;
            }

            try {
              grades[record.transcriptFile] = await fetchGradeFile(
                record.gradeFile
              );
            } catch (error) {
              console.warn(
                `Failed to load grade file ${record.gradeFile}:`,
                error
              );
            }
          })
        );

        // Calculate overall grade
        const gradedTranscripts = transcriptFiles.filter(
          (filename) => grades?.[filename]
        );
        const totalGrade = gradedTranscripts.reduce((sum, filename) => {
          return sum + (grades?.[filename]?.grade_percentage || 0);
        }, 0);
        const overallGrade =
          gradedTranscripts.length > 0
            ? totalGrade / gradedTranscripts.length
            : 0;

        setDispatcher({
          id: dispatcherName,
          name: dispatcherName,
          overallGrade,
          numRecords: recordNames.length,
          numTranscripts: transcriptFiles.length,
          numGrades: gradeFiles.length,
          files: {
            transcriptFiles,
            audioFiles,
          },
          records,
          grades,
        });
      } catch (error) {
        console.error("Failed loading dispatcher details:", error);
        router.push("/records");
      } finally {
        setLoading(false);
      }
    };

    loadDispatcher();
  }, [endDate, params.name, router, startDate]);

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <p>Loading...</p>
      </div>
    );
  }

  if (!dispatcher) {
    return (
      <div className="container mx-auto p-6">
        <p>Dispatcher not found.</p>
        <Link href="/records" className="text-blue-500 hover:underline">
          Back to Dispatchers
        </Link>
      </div>
    );
  }

  return (
    <DispatcherDetails
      dispatcher={dispatcher}
      batchMode={batchMode}
      startDate={startDate}
      endDate={endDate}
    />
  );
}

export default function DispatcherDetailPage() {
  return (
    <Suspense fallback={<div className="container mx-auto p-6"><p>Loading...</p></div>}>
      <DispatcherDetailContent />
    </Suspense>
  );
}
