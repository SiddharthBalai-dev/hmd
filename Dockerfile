FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn

# Copy all backend and model files
COPY MODEL3.PY .
COPY backend/ ./backend/
COPY patient_data_comprehensive_1770874277525.csv .
COPY trained_model.joblib .
COPY label_encoder.joblib .

EXPOSE 8080

CMD exec gunicorn --bind :${PORT:-8080} --workers 1 --threads 8 --timeout 120 backend.app:app
