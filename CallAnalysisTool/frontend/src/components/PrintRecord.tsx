"use client";
import React from "react";
import { Dispatcher } from "@/types/dispatcher";


interface TranscriptSegment {
  speaker?: string;
  text?: string;
  start: number;
  end: number;
}

interface TranscriptData {
  segments?: TranscriptSegment[];
}

export interface PrintCallRecord {
  transcriptFilename: string;
  dispatcherName: string;
  dateTime: Date;
  nature: string;
  gradePercentage: number;
  detectedNatureCode?: string;
  questionGrades: Record<string, { label: string; status: string }>;
  transcriptData: TranscriptData | null;
}

interface PrintRecordProps {
  records: PrintCallRecord[];
  onClose: () => void;
}



const formatTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};

const getStatusStyle = (status: string): React.CSSProperties => {
  const s = status.trim().toLowerCase();
  if (s === "asked correctly" || s === "obvious")
    return { color: "#16a34a", fontWeight: 600 };
  if (s === "not asked" || s === "asked incorrectly")
    return { color: "#dc2626", fontWeight: 600 };
  if (s === "not as scripted")
    return { color: "#d97706", fontWeight: 600 };
  return { color: "#6b7280", fontWeight: 500 };
};

const getGradeColor = (pct: number): string => {
  if (pct >= 80) return "#16a34a";
  if (pct >= 50) return "#d97706";
  return "#dc2626";
};


const CallSection = ({
  record,
  index,
  total,
}: {
  record: PrintCallRecord;
  index: number;
  total: number;
}) => {
  const segments = record.transcriptData?.segments ?? [];

  return (
    <div
      style={{
        pageBreakAfter: index < total - 1 ? "always" : "auto",
        fontFamily: "'Georgia', 'Times New Roman', serif",
        color: "#1a1a1a",
        padding: "40px 48px",
        maxWidth: "800px",
        margin: "0 auto",
      }}
    >
      {/* Header */}
      <div
        style={{
          borderBottom: "3px solid #1e3a5f",
          paddingBottom: "16px",
          marginBottom: "28px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <p style={{ fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase", color: "#6b7280", marginBottom: "4px" }}>
              Emergency Medical Call Analysis
            </p>
            <h1 style={{ fontSize: "26px", fontWeight: 700, color: "#1e3a5f", margin: 0 }}>
              Dispatcher Call Record
            </h1>
          </div>
          {total > 1 && (
            <div style={{ fontSize: "12px", color: "#6b7280", textAlign: "right", marginTop: "8px" }}>
              Call {index + 1} of {total}
            </div>
          )}
        </div>
      </div>

      {/* Call Info Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "12px 32px",
          marginBottom: "28px",
          padding: "20px 24px",
          backgroundColor: "#f8fafc",
          borderRadius: "6px",
          border: "1px solid #e2e8f0",
        }}
      >
        <InfoRow label="Dispatcher" value={record.dispatcherName} />
        <InfoRow
          label="Grade"
          value={`${record.gradePercentage.toFixed(1)}%`}
          valueStyle={{ color: getGradeColor(record.gradePercentage), fontWeight: 700, fontSize: "18px" }}
        />
        <InfoRow
          label="Date"
          value={record.dateTime.toLocaleDateString("en-US", {
            weekday: "long", year: "numeric", month: "long", day: "numeric",
          })}
        />
        <InfoRow
          label="Time"
          value={record.dateTime.toLocaleTimeString("en-US", {
            hour: "2-digit", minute: "2-digit", second: "2-digit",
          })}
        />
        <InfoRow label="Nature Code" value={record.nature || "—"} />
        {record.detectedNatureCode && (
          <InfoRow label="Detected Nature" value={record.detectedNatureCode} />
        )}
        <InfoRow
          label="File"
          value={record.transcriptFilename}
          valueStyle={{ fontSize: "11px", color: "#6b7280", fontFamily: "monospace" }}
        />
      </div>

      {/* Question Grades */}
      <section style={{ marginBottom: "28px" }}>
        <h2 style={{
          fontSize: "14px", fontWeight: 700, letterSpacing: "0.08em",
          textTransform: "uppercase", color: "#1e3a5f", borderBottom: "1px solid #e2e8f0",
          paddingBottom: "8px", marginBottom: "12px",
        }}>
          Grading Results
        </h2>

        {Object.keys(record.questionGrades).length === 0 ? (
          <p style={{ color: "#9ca3af", fontStyle: "italic" }}>No grading data available.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ backgroundColor: "#f1f5f9" }}>
                <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600, color: "#374151", borderBottom: "1px solid #e2e8f0" }}>
                  Question
                </th>
                <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#374151", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>
                  Result
                </th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(record.questionGrades).map(([key, q], i) => (
                <tr key={key} style={{ backgroundColor: i % 2 === 0 ? "#fff" : "#f8fafc" }}>
                  <td style={{ padding: "7px 10px", borderBottom: "1px solid #f1f5f9", color: "#374151" }}>
                    {q.label}
                  </td>
                  <td style={{ padding: "7px 10px", borderBottom: "1px solid #f1f5f9", textAlign: "right", ...getStatusStyle(q.status) }}>
                    {q.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Full Transcript */}
      <section>
        <h2 style={{
          fontSize: "14px", fontWeight: 700, letterSpacing: "0.08em",
          textTransform: "uppercase", color: "#1e3a5f", borderBottom: "1px solid #e2e8f0",
          paddingBottom: "8px", marginBottom: "16px",
        }}>
          Full Transcript
        </h2>

        {segments.length === 0 ? (
          <p style={{ color: "#9ca3af", fontStyle: "italic" }}>No transcript available.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {segments.map((seg, i) => {
              const isDispatcher = seg.speaker !== "caller";
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    gap: "12px",
                    alignItems: "flex-start",
                  }}
                >
                  {/* Timestamp */}
                  <span style={{
                    fontSize: "10px", color: "#9ca3af", fontFamily: "monospace",
                    minWidth: "42px", paddingTop: "2px", flexShrink: 0,
                  }}>
                    {formatTime(seg.start)}
                  </span>

                  {/* Speaker bubble */}
                  <div style={{
                    maxWidth: "85%",
                    marginLeft: isDispatcher ? "0" : "auto",
                  }}>
                    <div style={{
                      fontSize: "10px", fontWeight: 700, marginBottom: "3px",
                      color: isDispatcher ? "#1e3a5f" : "#065f46",
                      textTransform: "uppercase", letterSpacing: "0.06em",
                    }}>
                      {seg.speaker || "unknown"}
                    </div>
                    <div style={{
                      padding: "8px 12px",
                      borderRadius: "8px",
                      fontSize: "13px",
                      lineHeight: "1.5",
                      backgroundColor: isDispatcher ? "#eff6ff" : "#f0fdf4",
                      border: `1px solid ${isDispatcher ? "#bfdbfe" : "#bbf7d0"}`,
                      color: "#1a1a1a",
                    }}>
                      {seg.text}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Footer */}
      <div style={{
        marginTop: "40px", paddingTop: "12px",
        borderTop: "1px solid #e2e8f0",
        display: "flex", justifyContent: "space-between",
        fontSize: "10px", color: "#9ca3af",
      }}>
        <span>Emergency Medical Call Analysis System</span>
        <span>Printed {new Date().toLocaleString()}</span>
      </div>
    </div>
  );
};

const InfoRow = ({
  label,
  value,
  valueStyle,
}: {
  label: string;
  value: string;
  valueStyle?: React.CSSProperties;
}) => (
  <div>
    <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#9ca3af", marginBottom: "2px" }}>
      {label}
    </div>
    <div style={{ fontSize: "14px", fontWeight: 600, color: "#1a1a1a", ...valueStyle }}>
      {value}
    </div>
  </div>
);



const PrintRecord = ({ records, onClose }: PrintRecordProps) => {
  const handlePrint = () => window.print();

  return (
    <>
      {/* Screen UI: modal overlay with action bar */}
      <div
        className="print:hidden"
        style={{
          position: "fixed", inset: 0, zIndex: 50,
          backgroundColor: "rgba(0,0,0,0.5)",
          display: "flex", flexDirection: "column",
          alignItems: "center",
          overflowY: "auto",
          padding: "24px 0 48px",
        }}
      >
        {/* Action bar */}
        <div style={{
          display: "flex", gap: "12px", marginBottom: "20px",
          backgroundColor: "#fff", padding: "12px 20px",
          borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          alignItems: "center",
        }}>
          <span style={{ fontWeight: 600, color: "#1e3a5f", fontSize: "14px" }}>
            {records.length === 1
              ? "Print Record — 1 call"
              : `Print Records — ${records.length} calls`}
          </span>
          <button
            onClick={handlePrint}
            style={{
              backgroundColor: "#1e3a5f", color: "#fff",
              border: "none", borderRadius: "6px",
              padding: "8px 20px", fontWeight: 600,
              cursor: "pointer", fontSize: "14px",
            }}
          >
            🖨 Print / Save as PDF
          </button>
          <button
            onClick={onClose}
            style={{
              backgroundColor: "#f1f5f9", color: "#374151",
              border: "1px solid #e2e8f0", borderRadius: "6px",
              padding: "8px 16px", fontWeight: 500,
              cursor: "pointer", fontSize: "14px",
            }}
          >
            Cancel
          </button>
        </div>

        {/* Preview */}
        <div style={{
          backgroundColor: "#fff",
          boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
          width: "800px", maxWidth: "95vw",
          borderRadius: "4px",
        }}>
          {records.map((record, i) => (
            <CallSection key={i} record={record} index={i} total={records.length} />
          ))}
        </div>
      </div>

      {/* Print-only output, hides everything else */}
      <div className="hidden print:block">
        {records.map((record, i) => (
          <CallSection key={i} record={record} index={i} total={records.length} />
        ))}
      </div>
    </>
  );
};

export default PrintRecord;