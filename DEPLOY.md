# Deployment Guide - Health Monitor Device

## Architecture

```
ESP32-S3 (MAX30102 + LM35 sensors)
    │
    ├──► Firebase Realtime Database (stores raw vitals)
    │
    └──► Web App reads real-time data
              │
              ├── Frontend: Firebase Hosting (React)
              └── Backend:  Google Cloud Run (Flask + ML model)
```

## Prerequisites

- Node.js (v18+)
- Python 3.11+
- Google Cloud account with billing enabled
- Firebase CLI: `npm install -g firebase-tools`
- Google Cloud CLI: https://cloud.google.com/sdk/docs/install
- Docker (for Cloud Run)

---

## Step 1: Firebase Project Setup

You already have Firebase project `healthmonitor-6685d`. Verify it:

```bash
firebase login
firebase projects:list
```

### Enable Realtime Database Rules

Go to Firebase Console → Realtime Database → Rules, and set:

```json
{
  "rules": {
    "patients": {
      "$deviceId": {
        "vitals": {
          ".read": true,
          ".write": true
        }
      }
    }
  }
}
```

> For production, restrict `.write` to authenticated devices only.

---

## Step 2: Deploy Backend to Google Cloud Run

### 2a. Setup Google Cloud

```bash
# Login and set project
gcloud auth login
gcloud config set project healthmonitor-6685d

# Enable required APIs
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable artifactregistry.googleapis.com
```

### 2b. Train the model (if not already done)

```bash
cd c:\Personal\hmd
python MODEL3.PY
```

This creates `trained_model.joblib` and `label_encoder.joblib`.

### 2c. Build and deploy

```bash
cd c:\Personal\hmd

# Build and deploy to Cloud Run in one command
gcloud run deploy hmd-backend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --timeout 120 \
  --min-instances 0 \
  --max-instances 3
```

After deployment, you'll get a URL like:
```
https://hmd-backend-xxxxx-uc.a.run.app
```

### 2d. Test the deployed backend

```bash
curl https://hmd-backend-xxxxx-uc.a.run.app/api/health
```

---

## Step 3: Deploy Frontend to Firebase Hosting

### 3a. Update Firebase config to point to your Cloud Run URL

Edit `firebase.json` — the rewrite rule already points `/api/**` to the
Cloud Run service `hmd-backend`. This works automatically when both are
in the same Google Cloud project.

### 3b. Build the frontend

```bash
cd c:\Personal\hmd\frontend
npm install
npx vite build
```

### 3c. Deploy to Firebase Hosting

```bash
cd c:\Personal\hmd
firebase deploy --only hosting
```

Your app will be live at:
```
https://healthmonitor-6685d.web.app
```

---

## Step 4: Configure ESP32

### 4a. Update the Arduino sketch

In `sketch_oct4a.ino`, update:

```cpp
// Your WiFi
const char* WIFI_SSID = "YourWiFiName";
const char* WIFI_PASSWORD = "YourWiFiPassword";

// Your Firebase URL (already set)
const char* FIREBASE_URL = "https://healthmonitor-6685d-default-rtdb.firebaseio.com/";

// Optional: Direct backend URL (Cloud Run)
const char* BACKEND_URL = "https://hmd-backend-xxxxx-uc.a.run.app";

// Device ID — use this same ID in the web app to link
const char* DEVICE_ID = "PATIENT_001";
```

### 4b. Upload to ESP32-S3

1. Open `sketch_oct4a.ino` in Arduino IDE
2. Select Board: "ESP32S3 Dev Module"
3. Install libraries: MAX30105, ArduinoJson
4. Upload

### 4c. Wiring

```
ESP32-S3          MAX30102
─────────         ────────
GPIO 5 (SDA)  →   SDA
GPIO 6 (SCL)  →   SCL
3.3V           →   VIN
GND            →   GND

ESP32-S3          LM35
─────────         ────
A0 (GPIO 1)   →   OUT
3.3V           →   VCC
GND            →   GND
```

---

## Step 5: Use the Web App

1. Open `https://healthmonitor-6685d.web.app`
2. Click **"Train Now"** to train the ML model (first time only)
3. Click **"Register New Patient"** — fill in details
4. Go to patient detail → **"Live Device"** tab
5. Enter Device ID: `PATIENT_001` → Click **Connect**
6. Power on the ESP32 with finger on sensor
7. Vitals will appear in real-time with AI predictions
8. Click **"View Report"** for a full clinical health assessment

---

## Local Development

Run both servers locally:

```bash
# Terminal 1 — Backend
cd c:\Personal\hmd
python backend/app.py

# Terminal 2 — Frontend
cd c:\Personal\hmd\frontend
npm run dev
```

Frontend: http://localhost:5173
Backend: http://localhost:5000

The Vite dev server proxies `/api` to the Flask backend automatically.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Model not trained" | Click "Train Now" on dashboard, or run `python MODEL3.PY` |
| ESP32 no WiFi | Check SSID/password, ensure 2.4GHz network |
| Firebase permission denied | Update RTDB rules to allow read/write |
| Cloud Run cold start slow | Set `--min-instances 1` (costs more) |
| CORS errors | Backend has flask-cors enabled; check Cloud Run URL |
| SpO2 always invalid | Ensure finger is firmly placed, IR > 50000 |
