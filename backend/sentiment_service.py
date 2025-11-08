"""
Sentiment Analysis Service using Hugging Face Transformers.

Analyzes comment sentiment using a multilingual model that supports
German and English (and other languages).
"""

from transformers import pipeline
import logging
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)


class SentimentAnalyzer:
    """
    Sentiment analyzer using Hugging Face transformers pipeline.
    Uses a multilingual sentiment model that supports German, English, and others.
    """
    
    def __init__(self, model_name: str = "cardiffnlp/twitter-xlm-roberta-base-sentiment"):
        """
        Initialize the sentiment analyzer.

        Args:
            model_name: Hugging Face model identifier. Default targets a social-text
                        multilingual sentiment model suited for short comments/tweets.
        """
        try:
            logger.info(f"Loading sentiment analysis model: {model_name}")
            self.classifier = pipeline(
                "sentiment-analysis",
                model=model_name,
                device=-1  # CPU; set to 0 for GPU
            )
            self.model_name = model_name
            logger.info("Sentiment analyzer initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize sentiment analyzer: {e}")
            self.classifier = None
            self.model_name = model_name

    def _normalize_label(self, label: str) -> str:
        """Normalize various label formats to 'negative'|'neutral'|'positive'."""
        if not isinstance(label, str):
            return str(label)
        lab = label.lower()
        if lab.startswith('label_'):
            # index-based labels -> map common mapping used by cardiffnlp
            try:
                idx = int(lab.split('_', 1)[1])
                mapping = {0: 'negative', 1: 'neutral', 2: 'positive'}
                return mapping.get(idx, lab)
            except Exception:
                return lab
        if 'neg' in lab:
            return 'negative'
        if 'pos' in lab:
            return 'positive'
        if 'neutral' in lab:
            return 'neutral'
        return lab

    def analyze(self, text: str) -> Optional[Dict[str, any]]:
        """
        Analyze sentiment of a single text.

        Returns a dict with keys: 'label' (raw), 'score' (float), 'sentiment' (normalized).
        """
        if not self.classifier or not text or not text.strip():
            return None

        try:
            text_truncated = text[:500]
            result = self.classifier(text_truncated)[0]
            label = result.get('label')
            score = result.get('score')
            sentiment = self._normalize_label(label)
            return {'label': label, 'score': score, 'sentiment': sentiment}
        except Exception as e:
            logger.error(f"Error analyzing sentiment: {e}")
            return None

    def analyze_batch(self, texts: List[str]) -> List[Optional[Dict[str, any]]]:
        """
        Analyze sentiment of multiple texts in batch (more efficient).

        Returns list aligned with input texts; None for entries that failed or were empty.
        """
        if not self.classifier or not texts:
            return [None] * len(texts)

        try:
            texts_truncated = [t[:500] if t else "" for t in texts]
            valid_indices = [i for i, t in enumerate(texts_truncated) if t.strip()]
            valid_texts = [texts_truncated[i] for i in valid_indices]

            if not valid_texts:
                return [None] * len(texts)

            results_raw = self.classifier(valid_texts, batch_size=8, truncation=True)

            results = [None] * len(texts)
            for idx, result in zip(valid_indices, results_raw):
                label = result.get('label')
                score = result.get('score')
                sentiment = self._normalize_label(label)
                results[idx] = {'label': label, 'score': score, 'sentiment': sentiment}

            return results
        except Exception as e:
            logger.error(f"Error in batch sentiment analysis: {e}")
            return [None] * len(texts)


# Global singleton instance
_analyzer = None


def get_analyzer() -> SentimentAnalyzer:
    """Get or create the global sentiment analyzer instance."""
    global _analyzer
    if _analyzer is None:
        _analyzer = SentimentAnalyzer()
    return _analyzer
