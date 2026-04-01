"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Dispatcher } from "@/types/dispatcher";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { seedDispatchers } from "@/utils/seedDispatchers";

type SortField = "grade" | "name" | "date";
type SortDirection = "desc" | "asc";
type DispatcherWithMetrics = Dispatcher & {
  overallGrade: number;
  latestDisplayCallDate: Date | null;
};

const parseCallDateFromFilename = (filename: string): Date | null => {
  const match = filename.match(
    /^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})_/
  );
  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  );

  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDateForInput = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatDisplayDate = (date: Date | null): string =>
  date ? date.toLocaleDateString() : "Unknown";

const latestDate = (dates: Date[]): Date | null => {
  if (dates.length === 0) {
    return null;
  }

  return new Date(Math.max(...dates.map((date) => date.getTime())));
};

const DispatcherList = () => {
  const [dispatchers, setDispatchers] = useState<Dispatcher[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortField, setSortField] = useState<SortField>("grade");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [includeUnknownDate, setIncludeUnknownDate] = useState(false);

  // load all dispatchers
  const loadDispatchers = () => {
    seedDispatchers(); // ensure seed exists
    const storedDispatchers: Dispatcher[] =
      JSON.parse(localStorage.getItem("dispatchers") || "[]") || [];
    setDispatchers(storedDispatchers);
  };

  useEffect(() => {
    loadDispatchers();
    const handleUpdate = () => loadDispatchers();
    window.addEventListener("dispatchersUpdated", handleUpdate);
    return () => window.removeEventListener("dispatchersUpdated", handleUpdate);
  }, []);

  // Compute overall grade
  const dispatchersWithGrades: DispatcherWithMetrics[] = dispatchers.map(
    (dispatcher) => {
      const transcriptFiles = dispatcher.files?.transcriptFiles || [];
      const grades = dispatcher.grades || {};
      const gradedFiles = transcriptFiles.filter((file) => grades[file]);
      const overallGrade =
        gradedFiles.length > 0
          ? gradedFiles.reduce(
              (sum, file) => sum + grades[file].grade_percentage,
              0
            ) / gradedFiles.length
          : 0;
      return {
        ...dispatcher,
        overallGrade,
        latestDisplayCallDate: null,
      };
    }
  );

  // search by dispatcher name
  const searchFilteredDispatchers = dispatchersWithGrades.filter((d) =>
    d.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isDateRangeActive = Boolean(fromDate || toDate);
  const fromBoundary = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
  const toBoundary = toDate ? new Date(`${toDate}T23:59:59.999`) : null;

  const dateFilteredDispatchers: DispatcherWithMetrics[] =
    searchFilteredDispatchers
      .map((dispatcher) => {
        const transcriptFiles = dispatcher.files?.transcriptFiles || [];
        const grades = dispatcher.grades || {};
        const gradedFiles = transcriptFiles.filter((file) => grades[file]);

        const parsedDates = gradedFiles.map((filename) =>
          parseCallDateFromFilename(filename)
        );
        const knownDates = parsedDates.filter(
          (date): date is Date => date !== null
        );
        const hasUnknownDateGrade = parsedDates.some((date) => date === null);

        const inRangeDates = knownDates.filter((date) => {
          const afterFrom = fromBoundary ? date >= fromBoundary : true;
          const beforeTo = toBoundary ? date <= toBoundary : true;
          return afterFrom && beforeTo;
        });

        const latestKnownCallDate = latestDate(knownDates);
        const latestInRangeCallDate = latestDate(inRangeDates);
        const latestDisplayCallDate = isDateRangeActive
          ? latestInRangeCallDate
          : latestKnownCallDate;

        const includeByDateRange =
          !isDateRangeActive ||
          inRangeDates.length > 0 ||
          (includeUnknownDate && hasUnknownDateGrade);
        if (!includeByDateRange) {
          return null;
        }

        return {
          ...dispatcher,
          latestDisplayCallDate,
        };
      })
      .filter(
        (dispatcher): dispatcher is DispatcherWithMetrics => dispatcher !== null
      );

  const applyPresetRange = (days: number) => {
    const today = new Date();
    const from = new Date();
    from.setDate(today.getDate() - (days - 1));
    setFromDate(formatDateForInput(from));
    setToDate(formatDateForInput(today));
  };

  const clearDateFilters = () => {
    setFromDate("");
    setToDate("");
    setIncludeUnknownDate(false);
  };

  const compareByNameAsc = (a: DispatcherWithMetrics, b: DispatcherWithMetrics) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

  const sortByGradeDescending = (
    a: DispatcherWithMetrics,
    b: DispatcherWithMetrics
  ) => {
    if (b.overallGrade !== a.overallGrade) {
      return b.overallGrade - a.overallGrade;
    }

    return compareByNameAsc(a, b);
  };

  const sortByDate = (a: DispatcherWithMetrics, b: DispatcherWithMetrics) => {
    const aDate = a.latestDisplayCallDate;
    const bDate = b.latestDisplayCallDate;

    // Keep unknown dates at the bottom for both sort directions.
    if (!aDate && bDate) {
      return 1;
    }
    if (aDate && !bDate) {
      return -1;
    }
    if (!aDate && !bDate) {
      return compareByNameAsc(a, b);
    }

    const aTime = (aDate as Date).getTime();
    const bTime = (bDate as Date).getTime();
    if (aTime !== bTime) {
      return sortDirection === "desc" ? bTime - aTime : aTime - bTime;
    }

    return compareByNameAsc(a, b);
  };

  const topDispatchers = [...dispatchersWithGrades]
    .sort(sortByGradeDescending)
    .slice(0, 3);

  const sortedDispatchers = [...dateFilteredDispatchers].sort((a, b) => {
    if (sortField === "grade") {
      if (a.overallGrade !== b.overallGrade) {
        return sortDirection === "desc"
          ? b.overallGrade - a.overallGrade
          : a.overallGrade - b.overallGrade;
      }

      return compareByNameAsc(a, b);
    }

    if (sortField === "date") {
      return sortByDate(a, b);
    }

    return sortDirection === "asc"
      ? compareByNameAsc(a, b)
      : compareByNameAsc(b, a);
  });

  const gradeRankById = new Map(
    [...dateFilteredDispatchers]
      .sort(sortByGradeDescending)
      .map((dispatcher, index) => [dispatcher.id, index + 1] as const)
  );

  // get grade color
  const gradeColor = (grade: number) =>
    grade >= 80
      ? "text-green-600"
      : grade >= 50
      ? "text-yellow-500"
      : "text-red-600";

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-7xl">
      <h1 className="text-3xl font-bold text-center mb-8">
        Dispatcher Dashboard
      </h1>

      {/* Search Bar */}
      {dispatchers.length > 0 && (
        <div className="mb-6 max-w-md mx-auto">
          <input
            type="text"
            placeholder="Search dispatchers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      )}

      {/* Top Dispatchers */}
      {topDispatchers.length > 0 && searchQuery.trim().length === 0 && (
        <div className="mb-10">
          <h2 className="text-xl sm:text-2xl font-bold mb-4 text-center text-blue-600">
            Top Dispatchers
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {topDispatchers.map((dispatcher, index) => (
              <Link key={dispatcher.id} href={`/records/${dispatcher.id}`}>
                <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full flex flex-col relative border-blue-500 border-2">
                  <span className="absolute top-2 right-2 bg-yellow-400 text-white text-xs font-bold px-2 py-1 mb-1 rounded-full">
                    Rank #{index + 1}
                  </span>
                  <CardHeader className="flex-shrink-0">
                    <CardTitle className="text-lg font-semibold break-words">
                      {dispatcher.name}
                    </CardTitle>
                    <CardDescription className="text-xs truncate">
                      ID: {dispatcher.id.substring(0, 8)}...
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex-grow flex flex-col justify-between">
                    <p
                      className={`font-semibold mt-2 ${gradeColor(
                        dispatcher.overallGrade
                      )}`}
                    >
                      Overall Grade: {dispatcher.overallGrade.toFixed(1)}%
                    </p>
                    <div className="flex justify-between mt-2 text-xs text-gray-600">
                      <span>
                        Transcript: {dispatcher.files.transcriptFiles.length}
                      </span>
                      <span>Audio: {dispatcher.files.audioFiles.length}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* All Dispatchers Table */}
      <div className="mb-10">
        <h2 className="text-xl sm:text-2xl font-bold mb-4 text-center">
          All Dispatchers
        </h2>
        <div className="mb-4 border border-gray-200 rounded-lg p-4 bg-gray-50">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex flex-col">
              <label htmlFor="from-date" className="text-sm font-medium mb-1">
                From
              </label>
              <input
                id="from-date"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md bg-white"
              />
            </div>
            <div className="flex flex-col">
              <label htmlFor="to-date" className="text-sm font-medium mb-1">
                To
              </label>
              <input
                id="to-date"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md bg-white"
              />
            </div>
            <div className="flex flex-wrap gap-2 sm:ml-2">
              <button
                type="button"
                onClick={() => applyPresetRange(7)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-100"
              >
                Last 7 days
              </button>
              <button
                type="button"
                onClick={() => applyPresetRange(30)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-100"
              >
                Last 30 days
              </button>
              <button
                type="button"
                onClick={() => applyPresetRange(90)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-100"
              >
                Last 90 days
              </button>
              <button
                type="button"
                onClick={clearDateFilters}
                className="px-3 py-2 text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-100"
              >
                Clear
              </button>
            </div>
          </div>
          <label className="mt-3 inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={includeUnknownDate}
              onChange={(e) => setIncludeUnknownDate(e.target.checked)}
              disabled={!isDateRangeActive}
            />
            Include unknown date
          </label>
        </div>
        {sortedDispatchers.length === 0 ? (
          <p className="text-gray-500 text-center">
            No dispatchers found.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border border-gray-300 divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-sm font-medium">
                    Rank
                  </th>
                  <th
                    className="px-4 py-2 text-left text-sm font-medium cursor-pointer"
                    onClick={() => {
                      if (sortField === "name") {
                        setSortDirection((prev) =>
                          prev === "asc" ? "desc" : "asc"
                        );
                        return;
                      }

                      setSortField("name");
                      setSortDirection("asc");
                    }}
                  >
                    <span className="inline-flex items-center gap-1">
                      <span>Dispatcher</span>
                      <span
                        className={
                          sortField === "name" ? "font-extrabold" : "font-normal"
                        }
                      >
                        {sortField === "name"
                          ? sortDirection === "desc"
                            ? "↓"
                            : "↑"
                          : "↕"}
                      </span>
                    </span>
                  </th>
                  <th
                    className="px-4 py-2 text-left text-sm font-medium cursor-pointer"
                    onClick={() => {
                      if (sortField === "grade") {
                        setSortDirection((prev) =>
                          prev === "desc" ? "asc" : "desc"
                        );
                        return;
                      }

                      setSortField("grade");
                      setSortDirection("desc");
                    }}
                  >
                    <span className="inline-flex items-center gap-1">
                      <span>Overall Grade</span>
                      <span
                        className={
                          sortField === "grade"
                            ? "font-extrabold"
                            : "font-normal"
                        }
                      >
                        {sortField === "grade"
                          ? sortDirection === "desc"
                            ? "↓"
                            : "↑"
                          : "↕"}
                      </span>
                    </span>
                  </th>
                  <th
                    className="px-4 py-2 text-left text-sm font-medium cursor-pointer"
                    onClick={() => {
                      if (sortField === "date") {
                        setSortDirection((prev) =>
                          prev === "desc" ? "asc" : "desc"
                        );
                        return;
                      }

                      setSortField("date");
                      setSortDirection("desc");
                    }}
                  >
                    <span className="inline-flex items-center gap-1">
                      <span>Date</span>
                      <span
                        className={
                          sortField === "date" ? "font-extrabold" : "font-normal"
                        }
                      >
                        {sortField === "date"
                          ? sortDirection === "desc"
                            ? "↓"
                            : "↑"
                          : "↕"}
                      </span>
                    </span>
                  </th>
                  <th className="px-4 py-2 text-left text-sm font-medium">
                    Transcript Files
                  </th>
                  <th className="px-4 py-2 text-left text-sm font-medium">
                    Audio Files
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedDispatchers.map((dispatcher) => (
                  <tr key={dispatcher.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-sm">
                      {gradeRankById.get(dispatcher.id)}
                    </td>
                    <td className="px-4 py-2 text-sm">
                      <Link
                        href={`/records/${dispatcher.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {dispatcher.name}
                      </Link>
                    </td>
                    <td
                      className={`px-4 py-2 text-sm font-semibold ${gradeColor(
                        dispatcher.overallGrade
                      )}`}
                    >
                      {dispatcher.overallGrade.toFixed(1)}%
                    </td>
                    <td className="px-4 py-2 text-sm">
                      {formatDisplayDate(dispatcher.latestDisplayCallDate)}
                    </td>
                    <td className="px-4 py-2 text-sm">
                      {dispatcher.files.transcriptFiles.length}
                    </td>
                    <td className="px-4 py-2 text-sm">
                      {dispatcher.files.audioFiles.length}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default DispatcherList;
