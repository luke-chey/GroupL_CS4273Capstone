from llama_index.core.bridge.pydantic import BaseModel, Field
from typing import List, Optional


class NatureCode(BaseModel):
    """
    Data model for the Nature Code
    """
    name: str
    explanation: str
    confidence_level: float

class Question(BaseModel):
    """
    Data model for the Question
    """
    text: str = Field(description='The text of the question')
    was_asked: bool
    justification: str
    points: int = Field(description='1 if asked correctly, 2 if not asked, 3 if asked incorrectly, 4 if not as scripted, 5 if not applicable, and 6 if obvious (answered without asking)')

class NatureCodeQuestionAnalysis(BaseModel):
    nature_code: List[NatureCode] = Field(description="List of nature codes")
    required_questions: List[Question] 

