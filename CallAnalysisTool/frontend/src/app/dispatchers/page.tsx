"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Dispatcher } from "@/types/dispatcher";
import { v4 as uuidv4 } from "uuid";

export default function Dispatchers() {
  const [dispatchers, setDispatchers] = useState<Dispatcher[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [expandedDispatcherId, setExpandedDispatcherId] = useState<string | null>(null);
  const [fileMenuOpenId, setFileMenuOpenId] = useState<string | null>(null);

  useEffect(() => {
    const load = () => {
      const stored = JSON.parse(localStorage.getItem("dispatchers") || "[]");
      setDispatchers(stored);
    };
    load();
    window.addEventListener("dispatchersUpdated", load);
    return () => window.removeEventListener("dispatchersUpdated", load);
  }, []);

  const saveDispatchers = (updated: Dispatcher[]) => {
    localStorage.setItem("dispatchers", JSON.stringify(updated));
    setDispatchers(updated);
    window.dispatchEvent(new Event("dispatchersUpdated"));
  };

  const handleAddDispatcher = () => {
    const name = prompt("Enter new dispatcher name:");
    if (!name) return;
    const newDispatcher: Dispatcher = {
      id: uuidv4(),
      name,
      files: { transcriptFiles: [], audioFiles: [] },
      grades: {},
    };
    saveDispatchers([...dispatchers, newDispatcher]);
  };

  const handleDeleteDispatcher = (id: string) => {
    const dispatcher = dispatchers.find((d) => d.id === id);
    if (!dispatcher) return;
    if (confirm(`Are you sure you want to delete ${dispatcher.name}?`)) {
      saveDispatchers(dispatchers.filter((d) => d.id !== id));
    }
  };

  const handleRenameDispatcher = (id: string) => {
    const dispatcher = dispatchers.find((d) => d.id === id);
    if (!dispatcher) return;
    const newName = prompt("Enter new name:", dispatcher.name);
    if (!newName) return;
    const updated = dispatchers.map((d) =>
      d.id === id ? { ...d, name: newName } : d
    );
    saveDispatchers(updated);
  };

  const toggleExpand = (id: string) => {
    setExpandedDispatcherId(expandedDispatcherId === id ? null : id);
  };

  const handleDeleteCall = (dispatcherId: string, fileName: string) => {
    const dispatcher = dispatchers.find((d) => d.id === dispatcherId);
    if (!dispatcher) return;

    if (!confirm(`Are you sure you want to delete the call "${fileName}"?`)) return;

    dispatcher.files.transcriptFiles = dispatcher.files.transcriptFiles.filter(
      (f) => f !== fileName
    );
    const audioFileName = fileName.replace(".json", ".wav");
    dispatcher.files.audioFiles = dispatcher.files.audioFiles.filter(
      (f) => f !== audioFileName
    );

    if (dispatcher.grades) {
      delete dispatcher.grades[fileName];
    }

    saveDispatchers([...dispatchers]);
  };

  const filteredDispatchers = dispatchers.filter((d) =>
    d.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 max-w-6xl mx-auto">
      <h1
        className="text-4xl font-extrabold mb-6 text-center"
        style={{ color: "#002d62" }}
      >
        Dispatcher Dashboard
      </h1>

      <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-2">
        <input
          type="text"
          placeholder="Search dispatchers..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-grow px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <button
          onClick={handleAddDispatcher}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
        >
          Add Dispatcher
        </button>
      </div>

      <div className="overflow-x-auto bg-white rounded-lg shadow">
        <table className="w-full table-auto border-collapse">
          <thead>
            <tr className="bg-gray-100 text-left">
              <th className="py-2 px-4">Profile</th>
              <th className="py-2 px-4">Name</th>
              <th className="py-2 px-4">Graded Calls</th>
              <th className="py-2 px-4">Overall Grade</th>
              <th className="py-2 px-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredDispatchers.map((d) => {
              const overallGrade =
                d.files?.transcriptFiles?.length > 0
                  ? d.files.transcriptFiles.reduce(
                      (sum, file) => sum + (d.grades?.[file]?.grade_percentage || 0),
                      0
                    ) / d.files.transcriptFiles.length
                  : 0;

              return (
                <React.Fragment key={d.id}>
                  <tr
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => toggleExpand(d.id)}
                  >
                    <td className="py-3 px-4">
                      <Image
                        src="/starter-usericon.png"
                        width={40}
                        height={40}
                        alt="dispatcher icon"
                        className="rounded-full"
                      />
                    </td>
                    <td className="py-3 px-4">{d.name}</td>
                    <td className="py-3 px-4">{d.files?.transcriptFiles?.length ?? 0}</td>
                    <td className="py-3 px-4">{overallGrade.toFixed(1)}%</td>
                    <td className="py-3 px-4 relative">
                      {d.name !== "John Doe" && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuOpenId(menuOpenId === d.id ? null : d.id);
                            }}
                            className="px-2 py-1 text-gray-600 hover:bg-gray-200 rounded"
                          >
                            ⋮
                          </button>

                          {menuOpenId === d.id && (
                            <div
                              className="absolute right-0 mt-1 w-28 bg-white border border-gray-300 rounded shadow-lg z-10"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                onClick={() => handleRenameDispatcher(d.id)}
                                className="w-full text-left px-3 py-1 hover:bg-gray-100 text-blue-600"
                              >
                                Rename
                              </button>
                              <button
                                onClick={() => handleDeleteDispatcher(d.id)}
                                className="w-full text-left px-3 py-1 hover:bg-red-100 text-red-600"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </td>
                  </tr>

                  {expandedDispatcherId === d.id && d.files?.transcriptFiles?.length > 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-2">
                        <div className="bg-gray-100 rounded-lg shadow p-3">
                          <table className="w-full">
                            <thead>
                              <tr className="text-left text-gray-700">
                                <th className="py-1 px-2">Call</th>
                                <th className="py-1 px-2">Date Graded</th>
                                <th className="py-1 px-2">Grade</th>
                                <th className="py-1 px-2">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {d.files.transcriptFiles.map((file) => {
                                const grade = d.grades?.[file]?.grade_percentage ?? "N/A";
                                const dateGraded = d.grades?.[file]?.date || "Unknown";

                                return (
                                  <tr key={file} className="text-sm hover:bg-gray-200">
                                    <td className="py-1 px-2">
                                      <Link
                                        href={`/dispatchers/${d.id}/${file}`}
                                        className="text-blue-600 hover:underline"
                                      >
                                        {file}
                                      </Link>
                                    </td>
                                    <td className="py-1 px-2">{dateGraded}</td>
                                    <td className="py-1 px-2">{grade}</td>
                                    <td className="py-1 px-2 relative">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setFileMenuOpenId(
                                            fileMenuOpenId === file ? null : file
                                          );
                                        }}
                                        className="px-2 py-1 text-gray-600 hover:bg-gray-200 rounded"
                                      >
                                        ⋮
                                      </button>
                                      {fileMenuOpenId === file && (
                                        <div
                                          className="absolute right-0 mt-1 w-24 bg-white border border-gray-300 rounded shadow-lg z-10"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <button
                                            onClick={() => handleDeleteCall(d.id, file)}
                                            className="w-full text-left px-3 py-1 hover:bg-red-100 text-red-600"
                                          >
                                            Delete
                                          </button>
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
