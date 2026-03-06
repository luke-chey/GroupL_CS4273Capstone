"""
Question Loader Service
Loads protocol questions from EMSQA.csv
"""

import pandas as pd
from pathlib import Path
from typing import Dict

class QuestionLoader:
    """
    Loads EMS protocol questions from EMSQA.csv
    Questions are organized by Nature Code (e.g., Case Entry, Falls, Breathing Problems)
    """
    
    def __init__(self, csv_path=None):
        """
        Initialize the question loader
        
        Args:
            csv_path: Path to EMSQA.csv (defaults to backend/data/EMSQA.csv)
        """
        if csv_path is None:
            # Default path relative to this file
            base_path = Path(__file__).parent.parent.parent  # Go up to backend/
            csv_path = base_path / "data" / "EMSQA.csv"
        
        self.csv_path = Path(csv_path)
        self.df = None
        self._load_csv()
    
    def _load_csv(self):
        """Load the CSV file into a pandas DataFrame"""
        try:
            self.df = pd.read_csv(self.csv_path, encoding='utf-8')
            print(f"Loaded {len(self.df)} questions from EMSQA.csv")
        except FileNotFoundError:
            raise FileNotFoundError(f"EMSQA.csv not found at: {self.csv_path}")
        except Exception as e:
            raise RuntimeError(f"Failed to load EMSQA.csv: {e}")
    
    def load_case_entry_questions(self) -> Dict[str, str]:
        """
        Load Case Entry questions (NC_ID = 0)
        These are always asked regardless of call type
        
        Returns:
            Dict mapping question_id to question_text
            Example: {"1": "What's the location of the emergency?", ...}
        """
        # Filter for Case Entry (NC_ID = 0)
        case_entry = self.df[self.df['NC_ID'] == 0]
        
        # Build question dictionary
        questions = {}
        for _, row in case_entry.iterrows():
            q_id = str(row['Question_ID'])
            q_text = str(row['Question_Text'])
            
            # Skip empty question IDs
            if pd.isna(row['Question_ID']) or q_id == 'nan':
                continue
            
            questions[q_id] = q_text
        
        print(f"Loaded {len(questions)} Case Entry questions")
        return questions
    
    def load_questions_for_nature_code(self, nature_code_name: str) -> Dict[str, str]:
        """
        Load questions for a specific nature code
        
        Args:
            nature_code_name: Name of nature code (e.g., "Falls", "Breathing Problems")
        
        Returns:
            Dict mapping question_id to question_text
        """
        # Filter for the specific nature code
        nature_questions = self.df[self.df['NatureCode'] == nature_code_name]
        
        # Build question dictionary
        questions = {}
        for _, row in nature_questions.iterrows():
            q_id = str(row['Question_ID'])
            q_text = str(row['Question_Text'])
            
            # Skip empty question IDs
            if pd.isna(row['Question_ID']) or q_id == 'nan':
                continue
            
            questions[q_id] = q_text
        
        print(f"Loaded {len(questions)} questions for {nature_code_name}")
        return questions
    
    def load_all_questions_for_nature_codes(self, nature_code_names: list) -> Dict[str, str]:
        """
        Load questions for multiple nature codes (including Case Entry)
        
        Args:
            nature_code_names: List of nature code names
        
        Returns:
            Dict mapping question_id to question_text
        """
        all_questions = {}
        
        # Always include Case Entry
        all_questions.update(self.load_case_entry_questions())
        
        # Add questions for each specified nature code
        for nature_code in nature_code_names:
            if nature_code != "Case Entry":
                all_questions.update(self.load_questions_for_nature_code(nature_code))
        
        return all_questions
    
    def get_available_nature_codes(self) -> list:
        """
        Get list of all available nature codes in the CSV
        
        Returns:
            List of nature code names
        """
        return sorted(self.df['NatureCode'].unique().tolist())

