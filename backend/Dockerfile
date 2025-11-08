FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# Pre-download the sentiment model during build to avoid slow cold-starts at container runtime.
# This requires the transformer and tokenizer packages from requirements to be installed above.
RUN python - <<'PY'
from transformers import pipeline
print('Pre-caching sentiment model...')
pipeline('sentiment-analysis', model='cardiffnlp/twitter-xlm-roberta-base-sentiment')
print('Model cached')
PY

COPY . .

# App listens on 5055 by default (configured via PORT env); expose for documentation.
EXPOSE 5055

CMD ["python", "app.py"]
