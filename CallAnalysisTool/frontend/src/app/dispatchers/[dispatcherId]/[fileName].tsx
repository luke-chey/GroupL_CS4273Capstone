"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import PlayerController from "@/components/PlayerController/PlayerController";
import { Dispatcher } from "@/types/dispatcher";

export default function DispatcherFileDetail() {
  const params = useParams();
  const router = useRouter();

  const { dispatcherId, fileName } = params as { dispatcherId: string; fileName: string };

  // Load dispatchers from localStorage
  const stored = localStorage.getItem("dispatchers");
  const dispatchers: Dispatcher[] = stored ? JSON.parse(stored) : [];

  const dispatcher = dispatchers.find((d) => d.id === dispatcherId);
  if (!dispatcher) return <p>Dispatcher not found</p>;

  const gradeData = dispatcher.grades?.[fileName];

  return (
    <div className="container mx-auto p-6">
      <button
        className="text-blue-500 hover:underline mb-4"
        onClick={() => router.push("/dispatchers")}
      >
        ← Back to Dashboard
      </button>

      <h1 className="text-2xl font-bold mb-2">{dispatcher.name}</h1>
      <p className="text-gray-500 mb-4">File: {fileName}</p>

      {/* Audio Player */}
      <div className="mb-6">
        <h2 className="font-semibold mb-2">Audio Playback</h2>
        <PlayerController transcriptionId={fileName.replace(".json", "")} />
      </div>

      {/* Per-question Breakdown */}
      <div>
        <h2 className="font-semibold mb-2">Per-Question Breakdown</h2>
        {gradeData?.per_question ? (
          <table className="w-full border-collapse border border-gray-300">
            <thead>
              <tr className="bg-gray-100">
                <th className="py-2 px-3 border-b border-gray-300 text-left">Question</th>
                <th className="py-2 px-3 border-b border-gray-300 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(gradeData.per_question).map(([key, q]) => (
                <tr key={key} className="hover:bg-gray-50">
                  <td className="py-1 px-3 border-b border-gray-300">{q.label}</td>
                  <td className={`py-1 px-3 border-b border-gray-300 font-semibold ${
                    q.status === "Asked Correctly" || q.status === "Obvious"
                      ? "text-green-600"
                      : q.status === "Not As Scripted"
                      ? "text-yellow-500"
                      : "text-red-600"
                  }`}>
                    {q.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-gray-500">No per-question data available.</p>
        )}
      </div>
    </div>
  );
}
