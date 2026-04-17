"use client";


interface TranscriptSegment {
  speaker?: string;
  text?: string;
  start: number;
  end: number;
}

export interface TranscriptData {
  segments?: TranscriptSegment[];
}

export interface PrintCallRecord {
  transcriptFilename: string;
  gradeFilename?: string;
  audioFilename?: string;
  dispatcherName: string;
  dateTime: Date;
  nature: string;
  gradePercentage: number;
  detectedNatureCode?: string;
  questionGrades: Record<string, { label: string; status: string }>;
  transcriptData: TranscriptData | null;
}


const formatTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};

const getStatusColor = (status: string): string => {
  const s = status.trim().toLowerCase();
  if (s === "asked correctly" || s === "obvious") return "#16a34a";
  if (s === "not asked" || s === "asked incorrectly") return "#dc2626";
  if (s === "not as scripted") return "#d97706";
  return "#6b7280";
};

const getGradeColor = (pct: number): string => {
  if (pct >= 80) return "#16a34a";
  if (pct >= 50) return "#d97706";
  return "#dc2626";
};


const STOP_WORDS = new Set([
  "a","an","the","is","are","was","were","be","been","being",
  "have","has","had","do","does","did","will","would","could","should",
  "may","might","shall","can","need","dare","ought","used",
  "i","you","he","she","it","we","they","me","him","her","us","them",
  "my","your","his","its","our","their","mine","yours","ours","theirs",
  "this","that","these","those","what","which","who","whom","whose",
  "when","where","why","how","all","both","each","few","more","most",
  "other","some","such","no","not","only","same","so","than","too",
  "very","just","but","and","or","if","of","to","in","for","on","with",
  "at","by","from","up","about","into","through","during","before",
  "after","above","below","between","out","off","over","under","again",
  "further","then","once","s","t","re","ve","ll","d","m","okay","ok",
  "sir","maam","tell","say","said","get","let","go",
]);


const META_QUESTION_PATTERNS = [
  /were all (key )?questions asked in order/i,
  /fast track used/i,
  /cad dump/i,
  /911 cad/i,
  /awake and breathing asks separately/i,
  /recorded correctly/i,
  /documented in the entry/i,
  /confirmed.*verified/i,
  /verified.*confirmed/i,
  /address.*confirmed/i,
  /address.*verified/i,
  /phone number documented/i,
  /number documented/i,
  /you go check and tell/i,
  /tell me approximately/i,
  /go check/i,
];

const isMetaQuestion = (question: string): boolean =>
  META_QUESTION_PATTERNS.some((p) => p.test(question));


// Each entry: [question regex, array of phrases to search for in transcript]
// Phrases are searched as substrings (case-insensitive).
// Longer/more specific phrases are weighted higher automatically.
const QUESTION_SEARCH_TERMS: Array<[RegExp, string[]]> = [
  // Location / address
  [/location of the emergency/i,      ["address","what street","where","location","emergency","911"]],
  [/address.*confirm|confirm.*address/i, ["that right","correct address","verify","confirm","is that","right address"]],

  // Phone number
  [/phone number.*calling from|calling from.*phone/i, ["callback","phone number","call you","your number","number","reach you"]],
  [/phone number documented|number documented/i,       ["number","phone","callback","noted"]],

  // What happened / chief complaint
  [/tell me.*what happened|exactly what happened/i,   ["going on","what happened","wrong","why","reason","calling","help","need","what's wrong","whats wrong","what is wrong","going on there","happening","what's going on"]],
  [/what.*happened|going on/i,                        ["going on","what happened","wrong","problem","situation","happening","whats going on","what's going on"]],

  // With the patient
  [/with the patient/i,               ["with","there","next to","beside","with him","with her","with them","i am","i'm here","right here","present","same room","scene"]],

  // How many people
  [/how many people|how many.*hurt|how many.*sick/i,  ["how many","anyone else","anybody else","others","alone","by yourself","just you","one person","more people","other people"]],

  // Breathing
  [/breathing or coughing/i,          ["breathing","breath","cough","normal","air","chest","wheez","gasp","respiratory","short of breath"]],
  [/breathing normally/i,             ["breathing normal","breath normal","breathe normally","normal breathing","breathing okay","is.*breathing"]],
  [/is.*breathing/i,                  ["breathing","breath","breathe","respiratory","air","chest","normal","labored","short of breath","difficulty breathing"]],

  // Awake / alert / conscious
  [/is.*awake/i,                      ["awake","conscious","alert","responsive","eyes open","talking","responding","wake","aware"]],
  [/is.*alert|completely alert/i,     ["alert","awake","conscious","aware","oriented","responding","coherent","talking"]],

  // Bleeding / blood / vomiting
  [/bleeding or vomiting|vomiting blood/i, ["bleeding","blood","vomit","throwing up blood","vomiting blood","bleed","wound","hemorrhage","blood in"]],
  [/is.*bleeding/i,                   ["bleeding","blood","bleed","losing blood","wound","cut","gushing","hemorrhage"]],
  [/vomiting|throwing up/i,           ["vomiting","throwing up","vomit","nausea","sick","threw up","blood"]],

  // Pain
  [/have any pain|any pain/i,         ["pain","hurt","hurting","ache","discomfort","sore","burning","pressure","tender","cramping","painful"]],

  // Age
  [/how old|age of/i,                 ["old","age","years","born","birth","how old","year old"]],

  // Awake+breathing separately
  [/awake and breathing/i,            ["awake","breathing","alert","conscious","responsive"]],

  // Stay on line
  [/stay on.*line/i,                  ["stay on","don't hang up","keep talking","hold on","remain","line with me","on the line"]],

  // Door / access
  [/door|unlock/i,                    ["door","unlock","unlocked","open","access","entry","let them in","front door"]],

  // Name
  [/your name|patient.*name|name.*patient/i, ["name","who are you","identify","call you","your name","what's your name","whats your name"]],

  // Medications
  [/medications|meds/i,               ["medications","meds","medicine","taking","prescribed","pills","drugs","prescription"]],

  // Medical history
  [/medical.*history|history.*medical/i, ["history","condition","prior","medical","chronic","existing","past","health","disorder"]],

  // Allergies
  [/allergies|allergic/i,             ["allerg","reaction","sensitive","epipen","anaphylaxis"]],

  // Ambulance / dispatched
  [/ambulance|dispatched|on the way/i, ["ambulance","ems","paramedics","en route","on the way","dispatched","sending help","help on the way","medics","crew","started"]],

  // Callback
  [/callback|call.*back/i,            ["callback","call back","phone","number","reach","contact","your number"]],

  // Fast track (even though meta, add transcript hints)
  [/fast track/i,                     ["ambulance","started","en route","on the way","dispatched","sending","ems","medics"]],

  // Questions in order
  [/questions.*order|asked in order/i, ["questions","order","protocol","first","next","following","scripted"]],

  // Sick/hurt/ill
  [/hurt.*sick|sick.*hurt|how many/i, ["hurt","sick","ill","injured","patients","people","persons","anyone"]],

  // Chest / cardiac
  [/chest|cardiac|heart/i,            ["chest","heart","cardiac","palpitations","chest pain","pressure","tightness"]],

  // Seizure
  [/seizure|convuls/i,                ["seizure","convuls","shaking","tremor","epilep","fit"]],

  // Overdose / substance
  [/overdose|substance|alcohol/i,     ["overdose","od","drug","alcohol","drunk","intoxicated","pills","took too much"]],
];

const getSearchTerms = (question: string): string[] => {
  const terms: string[] = [];

  // Check overrides first
  for (const [pattern, phrases] of QUESTION_SEARCH_TERMS) {
    if (pattern.test(question)) {
      terms.push(...phrases);
    }
  }

  // Also extract raw keywords from the question itself as fallback
  const rawWords = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w));

  terms.push(...rawWords);

  // Add 2-word phrases from question
  for (let i = 0; i < rawWords.length - 1; i++) {
    terms.push(`${rawWords[i]} ${rawWords[i + 1]}`);
  }

  return [...new Set(terms)]; // deduplicate
};


const scoreSegment = (text: string, terms: string[]): number => {
  if (!terms.length || !text) return 0;
  const lower = text.toLowerCase();
  let hits = 0;
  let totalWeight = 0;

  terms.forEach((term) => {
    const weight = term.includes(" ") ? 3 : 1; // phrases worth 3x
    totalWeight += weight;
    if (lower.includes(term.toLowerCase())) hits += weight;
  });

  return totalWeight > 0 ? hits / totalWeight : 0;
};


const findBestMatchingSegment = (
  question: string,
  segments: Array<{ text?: string; speaker?: string }>,
  threshold = 0.06
): number => {
  if (isMetaQuestion(question)) return -2;

  const terms = getSearchTerms(question);
  if (!terms.length) return -1;

  let bestScore = threshold;
  let bestIndex = -1;

  segments.forEach((seg, i) => {
    // Score this segment
    let score = scoreSegment(seg.text || "", terms);

    // Bonus: also score combined with adjacent segment (question+answer pair)
    const adjacent = i < segments.length - 1 ? segments[i + 1] : segments[i - 1];
    if (adjacent) {
      const combined = scoreSegment((seg.text || "") + " " + (adjacent.text || ""), terms);
      score = Math.max(score, combined * 0.8);
    }

    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  });

  return bestIndex;
};


const buildQuestionSegmentMap = (
  questionGrades: Record<string, { label: string; status: string }>,
  segments: Array<{ text?: string; speaker?: string }>
): Map<string, number> => {
  const map = new Map<string, number>();

  Object.entries(questionGrades).forEach(([qId, q]) => {
    const idx = findBestMatchingSegment(q.label, segments);

    if (idx === -2) {
      map.set(qId, -1); // context implied
    } else if (idx >= 0) {
      // If matched a caller segment, check if prev dispatcher line is better to show
      const matched = segments[idx];
      const isCallerMatch = matched?.speaker === "caller";
      if (isCallerMatch && idx > 0) {
        const prev = segments[idx - 1];
        const terms = getSearchTerms(q.label);
        const prevScore = scoreSegment(prev.text || "", terms);
        const currScore = scoreSegment(matched.text || "", terms);
        // Prefer dispatcher line if it scores at least 60% as well as caller line
        map.set(qId, prevScore >= currScore * 0.6 && prev.speaker !== "caller" ? idx - 1 : idx);
      } else {
        map.set(qId, idx);
      }
    }
    // idx === -1: no match, don't add 
  });

  return map;
};



const buildHtml = (records: PrintCallRecord[]): string => {
  const callSections = records.map((record, index) => {
    const segments = record.transcriptData?.segments ?? [];

    // Build keyword-match map: questionId
    const qSegMap = buildQuestionSegmentMap(record.questionGrades, segments);

    // Reverse map: segment index 
    const segQMap = new Map<number, string[]>();
    qSegMap.forEach((segIdx, qId) => {
      if (!segQMap.has(segIdx)) segQMap.set(segIdx, []);
      segQMap.get(segIdx)!.push(qId);
    });

    const questionRows = Object.entries(record.questionGrades)
      .map(([key, q], rowIdx) => {
        const matchedSegIdx = qSegMap.get(key);
        // matchedSegIdx: undefined = not in map, -1 = no match, -2 = context implied, >=0 = real match
        const isContextImplied = matchedSegIdx === -1;
        const hasRealMatch = matchedSegIdx !== undefined && matchedSegIdx >= 0;
        const seg = hasRealMatch ? segments[matchedSegIdx] : null;

        // Also grab the caller response (next segment) if the match is a dispatcher line
        const nextSeg = (hasRealMatch && matchedSegIdx !== undefined && matchedSegIdx >= 0)
          ? segments[matchedSegIdx + 1]
          : null;
        const hasCallerResponse = nextSeg && nextSeg.speaker === "caller" && (nextSeg.text || "").length > 3;

        const evidenceText = hasRealMatch && seg?.text
          ? `<div style="font-size:11px;color:#6b7280;margin-top:4px;padding-left:8px;border-left:2px solid #e2e8f0">
               <div style="font-style:italic;color:#374151">"${seg.text.length > 120 ? seg.text.slice(0, 120) + "…" : seg.text}"
               <span style="color:#9ca3af;margin-left:6px">[${formatTime(seg.start)}] ${seg.speaker || ""}</span></div>
               ${hasCallerResponse ? `<div style="font-style:italic;color:#065f46;margin-top:2px">"${(nextSeg!.text||"").length > 120 ? (nextSeg!.text||"").slice(0,120)+"…" : nextSeg!.text}"
               <span style="color:#9ca3af;margin-left:6px">[${formatTime(nextSeg!.start)}] ${nextSeg!.speaker || ""}</span></div>` : ""}
             </div>`
          : isContextImplied
          ? `<div style="font-size:11px;color:#6b7280;font-style:italic;margin-top:3px;padding-left:8px;border-left:2px solid #d1d5db">Context implied — not a literal transcript line</div>`
          : `<div style="font-size:11px;color:#dc2626;font-style:italic;margin-top:3px;padding-left:8px;border-left:2px solid #fecaca">No matching segment found in transcript</div>`;

        return `
        <tr style="background:${rowIdx % 2 === 0 ? "#fff" : "#f8fafc"}">
          <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;color:#374151;font-size:13px">
            <div>${q.label}</div>
            ${evidenceText}
          </td>
          <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:13px;font-weight:600;color:${getStatusColor(q.status)};vertical-align:top">${q.status}</td>
        </tr>
      `}).join("");

    const transcriptLines = segments.map((seg, segIdx) => {
      const isDispatcher = seg.speaker !== "caller";
      const matchedQIds = segQMap.get(segIdx) || [];
      const isMatched = matchedQIds.length > 0;

      // Build a label showing which questions matched this segment
      // Deduplicate by status so same result doesn't repeat multiple times
      const seenStatuses = new Set<string>();
      const matchLabels = matchedQIds
        .map((qId) => {
          const q = record.questionGrades[qId];
          const status = q?.status || qId;
          if (seenStatuses.has(status)) return "";
          seenStatuses.add(status);
          const color = getStatusColor(status);
          return `<span style="display:inline-block;font-size:10px;font-weight:700;color:${color};background:${color}18;padding:2px 8px;border-radius:4px;margin-right:6px;margin-top:2px;border:1px solid ${color}44">${status}</span>`;
        })
        .filter(Boolean)
        .join(" ");

      return `
        <div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:10px;${isMatched ? "background:#fffbeb;border-radius:8px;padding:6px;border:1px solid #fde68a;" : ""}">
          <span style="font-size:10px;color:#9ca3af;font-family:monospace;min-width:42px;padding-top:2px;flex-shrink:0">${formatTime(seg.start)}</span>
          <div style="max-width:85%;${isDispatcher ? "" : "margin-left:auto"};flex:1">
            <div style="font-size:10px;font-weight:700;margin-bottom:3px;color:${isDispatcher ? "#1e3a5f" : "#065f46"};text-transform:uppercase;letter-spacing:0.06em">${seg.speaker || "unknown"}</div>
            <div style="padding:8px 12px;border-radius:8px;font-size:13px;line-height:1.5;background:${isMatched ? "#fff" : isDispatcher ? "#eff6ff" : "#f0fdf4"};border:1px solid ${isMatched ? "#fde68a" : isDispatcher ? "#bfdbfe" : "#bbf7d0"};color:#1a1a1a">${seg.text || ""}</div>
            ${isMatched ? `<div style="margin-top:4px">${matchLabels}</div>` : ""}
          </div>
        </div>
      `;
    }).join("");

    const pageBreak = index < records.length - 1
      ? 'style="page-break-after:always"'
      : "";

    return `
      <div ${pageBreak}>
        <!-- Header -->
        <div style="border-bottom:3px solid #1e3a5f;padding-bottom:16px;margin-bottom:28px;display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <p style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#6b7280;margin:0 0 4px 0">Emergency Medical Call Analysis</p>
            <h1 style="font-size:26px;font-weight:700;color:#1e3a5f;margin:0">Dispatcher Call Record</h1>
          </div>
          ${records.length > 1 ? `<div style="font-size:12px;color:#6b7280;margin-top:8px">Call ${index + 1} of ${records.length}</div>` : ""}
        </div>

        <!-- Info Grid -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 32px;margin-bottom:28px;padding:20px 24px;background:#f8fafc;border-radius:6px;border:1px solid #e2e8f0">
          <div>
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;margin-bottom:2px">Dispatcher</div>
            <div style="font-size:14px;font-weight:600">${record.dispatcherName}</div>
          </div>
          <div>
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;margin-bottom:2px">Grade</div>
            <div style="font-size:18px;font-weight:700;color:${getGradeColor(record.gradePercentage)}">${record.gradePercentage.toFixed(1)}%</div>
          </div>
          <div>
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;margin-bottom:2px">Date</div>
            <div style="font-size:14px;font-weight:600">${record.dateTime.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>
          </div>
          <div>
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;margin-bottom:2px">Time</div>
            <div style="font-size:14px;font-weight:600">${record.dateTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>
          </div>
          <div>
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;margin-bottom:2px">Nature Code</div>
            <div style="font-size:14px;font-weight:600">${record.detectedNatureCode || "—"}</div>
          </div>
          <div style="grid-column:1/-1">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;margin-bottom:2px">Files</div>
            <div style="font-size:11px;font-weight:600;font-family:monospace;color:#6b7280">${record.transcriptFilename}</div>
            <div style="font-size:11px;font-weight:600;font-family:monospace;color:#6b7280">${record.gradeFilename || "—"}</div>
            <div style="font-size:11px;font-weight:600;font-family:monospace;color:#6b7280">${record.audioFilename || "—"}</div>
          </div>
        </div>

        <!-- Grading Results -->
        <div style="margin-bottom:28px">
          <h2 style="font-size:14px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#1e3a5f;border-bottom:1px solid #e2e8f0;padding-bottom:8px;margin-bottom:12px">Grading Results</h2>
          ${Object.keys(record.questionGrades).length === 0
            ? `<p style="color:#9ca3af;font-style:italic">No grading data available.</p>`
            : `<table style="width:100%;border-collapse:collapse">
                <thead>
                  <tr style="background:#f1f5f9">
                    <th style="text-align:left;padding:8px 10px;font-weight:600;color:#374151;border-bottom:1px solid #e2e8f0;font-size:13px">Question</th>
                    <th style="text-align:right;padding:8px 10px;font-weight:600;color:#374151;border-bottom:1px solid #e2e8f0;white-space:nowrap;font-size:13px">Result</th>
                  </tr>
                </thead>
                <tbody>${questionRows}</tbody>
              </table>`
          }
        </div>

        <!-- Transcript -->
        <div>
          <h2 style="font-size:14px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#1e3a5f;border-bottom:1px solid #e2e8f0;padding-bottom:8px;margin-bottom:16px">Full Transcript</h2>
          ${segments.length === 0
            ? `<p style="color:#9ca3af;font-style:italic">No transcript available.</p>`
            : transcriptLines
          }
        </div>

        <!-- Footer -->
        <div style="margin-top:40px;padding-top:12px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:10px;color:#9ca3af">
          <span>Emergency Medical Call Analysis System</span>
          <span>Exported ${new Date().toLocaleString()}</span>
        </div>
      </div>
    `;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Dispatcher Call Record — ${records[0]?.dispatcherName ?? ""}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #1a1a1a;
      background: #f3f4f6;
      padding: 32px 16px;
    }
    .page {
      background: #fff;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 48px;
      border-radius: 6px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08);
    }
    .toolbar {
      max-width: 800px;
      margin: 0 auto 20px;
      display: flex;
      gap: 10px;
      align-items: center;
    }
    .btn-print {
      background: #1e3a5f;
      color: #fff;
      border: none;
      border-radius: 6px;
      padding: 9px 20px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-close {
      background: #f1f5f9;
      color: #374151;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 9px 16px;
      font-size: 14px;
      cursor: pointer;
    }
    @media print {
      body { background: #fff; padding: 0; }
      .toolbar { display: none; }
      .page { box-shadow: none; border-radius: 0; padding: 24px 32px; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <strong style="color:#1e3a5f;font-size:14px">
      ${records.length === 1 ? "1 call record" : `${records.length} call records`} — ${records[0]?.dispatcherName ?? ""}
    </strong>
    <button class="btn-print" onclick="window.print()">🖨 Print / Save as PDF</button>
    <button class="btn-close" onclick="window.close()">Close</button>
  </div>
  <div class="page">
    ${callSections}
  </div>
</body>
</html>`;
};


export const exportRecord = (records: PrintCallRecord[]): void => {
  const html = buildHtml(records);
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const tab = window.open(url, "_blank");
  // Revoke the object URL after the tab has loaded
  if (tab) {
    tab.addEventListener("load", () => URL.revokeObjectURL(url), { once: true });
  }
};


export default exportRecord;
