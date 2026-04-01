# Nature code detection for EMS call transcripts
# Detects NatureCodes using keyword matching and text embeddings
# CS4273 Group G 

import pandas as pd
import json
import re
from collections import defaultdict
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
from datetime import datetime
import argparse
import os
from pathlib import Path

# Get the directory where this script is located
SCRIPT_DIR = Path(__file__).parent

# Step 0: Load the EMS protocol questions
try:
    emsqa_path = SCRIPT_DIR / "data" / "EMSQA.csv"
    if not emsqa_path.exists():
        # Fallback: try relative to current working directory
        emsqa_path = Path("data/EMSQA.csv")
    if not emsqa_path.exists():
        raise FileNotFoundError(f"EMSQA.csv not found. Tried: {SCRIPT_DIR / 'data' / 'EMSQA.csv'} and data/EMSQA.csv")
    df = pd.read_csv(emsqa_path)  # This has all our protocol questions
    print(f"Loaded EMSQA.csv from: {emsqa_path}")
except Exception as e:
    print(f"ERROR loading EMSQA.csv: {e}")
    raise

# Step 1: Load NatureCode keywords
try:
    nature_keywords_path = SCRIPT_DIR / "nature_keywords.json"
    if not nature_keywords_path.exists():
        # Fallback: try relative to current working directory
        nature_keywords_path = Path("nature_keywords.json")
    if not nature_keywords_path.exists():
        raise FileNotFoundError(f"nature_keywords.json not found. Tried: {SCRIPT_DIR / 'nature_keywords.json'} and nature_keywords.json")
    with open(nature_keywords_path) as f:
        NATURE_KEYWORDS = json.load(f)
    print(f"Loaded nature_keywords.json from: {nature_keywords_path}")
except Exception as e:
    print(f"ERROR loading nature_keywords.json: {e}")
    raise

# Step 2: Organize protocol questions by NatureCode 
protocol_questions = defaultdict(list)
for _, row in df.iterrows():
    protocol_questions[row["NatureCode"]].append((row["Question_ID"], row["Question_Text"]))

# Step 3: Load embedding model (lazy loading to avoid import-time failures)
_model_instance = None

def get_model():
    """Lazy load the SentenceTransformer model - only loads when first needed"""
    global _model_instance
    if _model_instance is None:
        import os
        
        # Local model path where it was saved during Docker build
        local_model_path = '/app/models/all-MiniLM-L6-v2'
        
        # Fallback to downloading if not in Docker (for local development)
        if os.path.exists(local_model_path):
            print(f"Loading SentenceTransformer model from local path: {local_model_path}", flush=True)
            try:
                _model_instance = SentenceTransformer(local_model_path)
                print("SentenceTransformer model loaded successfully!", flush=True)
            except Exception as e:
                raise RuntimeError(f"Failed to load SentenceTransformer model from {local_model_path}. Error: {e}")
        else:
            # Not in Docker - try to download (for local development)
            print("Local model not found, attempting to download...", flush=True)
            try:
                _model_instance = SentenceTransformer("all-MiniLM-L6-v2")
                print("SentenceTransformer model downloaded and loaded successfully!", flush=True)
            except Exception as e:
                raise RuntimeError(f"Failed to load SentenceTransformer model 'all-MiniLM-L6-v2'. Error: {e}")
                
    return _model_instance

# Step 4: Detection setup 
# Words that are super common and might trigger false positives
COMMON_WORDS = {
    "pain", "breathing", "awake", "okay", "help", "address",
    "speaking", "crying", "safe", "discomfort", "problems", "normal", "talk"
}

# NatureCodes that we consider high priority (only need one keyword hit to trigger)
HIGH_PRIORITY_CODES = {
    "Allergies / Envenomations",
    "Burns (Scalds) / Explosion (Blast)",
    "Breathing Problems",
    "Choking",
    "Cardiac or Respiratory Arrest / Death"
}

def run_detection(transcript_path, transcript_text, output_folder="keywordsOutput"):
    # Split transcript into individual lines/segments
    segment_texts = [line.strip() for line in transcript_text.split("\n") if line.strip()]
    transcript_lower = transcript_text.lower()

    # Prepare embeddings for similarity comparison
    model = get_model()  # Lazy load model when actually needed
    nature_names = list(NATURE_KEYWORDS.keys())
    nature_texts = [" ".join(NATURE_KEYWORDS[n]) for n in nature_names]
    nature_embeddings = model.encode(nature_texts, convert_to_numpy=True, normalize_embeddings=True)
    segment_embeddings = model.encode(segment_texts, convert_to_numpy=True, normalize_embeddings=True)
    transcript_embedding = model.encode(transcript_text, convert_to_numpy=True, normalize_embeddings=True)
    sims_to_transcript = cosine_similarity([transcript_embedding], nature_embeddings)[0]

    triggered_naturecodes = set()
    match_details = {}
    confidence_scores = {}

    # Go through each NatureCode and see if it should be triggered
    for i, nature in enumerate(nature_names):
        keywords = NATURE_KEYWORDS[nature]
        strong_hits = []

        for seg in segment_texts:
            seg_lower = seg.lower()
            for kw in keywords:
                kw_low = kw.lower()
                if re.search(rf"\b{re.escape(kw_low)}\b", seg_lower):
                    if kw_low in COMMON_WORDS and nature != "Sick Person (Specific Diagnosis)":
                        continue
                    strong_hits.append(kw_low)

        strong_hits = list(set(strong_hits))
        sim_score = float(sims_to_transcript[i])
        confidence = round(sim_score + 0.1 * len(strong_hits), 3)
        confidence_scores[nature] = confidence

        # Trigger rules
        if nature == "Case Entry":
            # Always include Case Entry
            case_keywords = ["emergency", "address", "phone", "patient", "confirmed", "verified"]
            case_hits = [kw for kw in case_keywords if kw in transcript_lower]
            triggered_naturecodes.add("Case Entry")
            match_details["Case Entry"] = case_hits or ["None"]
            confidence_scores["Case Entry"] = confidence_scores.get("Case Entry", 0.3)
        else:
            # High-priority codes only need one keyword, others need 2+
            if (nature in HIGH_PRIORITY_CODES and len(strong_hits) >= 1) or len(strong_hits) >= 2:
                triggered_naturecodes.add(nature)
                match_details[nature] = strong_hits

    # Remove "Unknown Problem" if other stronger codes exist
    if "Unknown Problem (Person Down)" in triggered_naturecodes and any(
        n for n in triggered_naturecodes if n not in ["Case Entry", "Unknown Problem (Person Down)"]
    ):
        triggered_naturecodes.remove("Unknown Problem (Person Down)")

    # Sort by confidence
    triggered_naturecodes = sorted(triggered_naturecodes, key=lambda n: confidence_scores.get(n, 0), reverse=True)

    # Step 5: Save output 
    if not os.path.exists(output_folder):
        os.makedirs(output_folder)
    transcript_name = os.path.basename(transcript_path).replace(".json", "")
    log_filename = os.path.join(output_folder, f"{transcript_name}_naturecodes.txt")

    with open(log_filename, "w") as log_file:
        log_file.write("\nFiltered relevant NatureCodes (sorted by confidence):\n")
        for n in triggered_naturecodes:
            keywords_found = ", ".join(match_details.get(n, [])) or "None"
            conf = confidence_scores[n]
            log_file.write(f"- {n}\n   Keywords: {keywords_found}\n   Confidence: {conf:.3f}\n")

    print(f"Finished processing {transcript_path}, results saved to {log_filename}")

    return log_filename


# Step 6: main, output
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Detect NatureCodes in a transcript")
    parser.add_argument("transcript", help="Path to transcript file (.txt)")
    parser.add_argument("--output", default="keywordsOutput", help="Folder to save outputs")
    args = parser.parse_args()

    run_detection(args.transcript, args.output)
