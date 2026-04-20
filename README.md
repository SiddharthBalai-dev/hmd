# Smart Portable Patient Monitoring Device

AI-powered health monitoring system using ESP32-S3 with MAX30102 (Heart Rate & SpO2) and LM35 (Temperature) sensors.

---

## Project Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        HARDWARE LAYER                           │
│                                                                 │
│   ESP32-S3 Microcontroller                                      │
│   ├── MAX30102 Sensor ──► Heart Rate (BPM) + SpO2 (%)          │
│   ├── LM35 Sensor ──────► Body Temperature (°C)                │
│   └── WiFi Module ──────► Sends data every 10 seconds          │
│                                                                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     FIREBASE REALTIME DB                         │
│                                                                 │
│   Path: patients/{DEVICE_ID}/vitals/{pushId}                    │
│   Data: { heartRate, spO2, temperature, timestamp, deviceId }   │
│                                                                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (React + Vite)                       │
│                                                                 │
│   1. Firebase SDK listens for new readings in real-time         │
│   2. Displays live vitals (HR, SpO2, Temp)                     │
│   3. Sends each reading to Flask backend for ML analysis        │
│   4. Shows AI prediction, risk score, recommendations           │
│   5. Renders charts, trends, alerts, and health reports         │
│                                                                 │
│   Tabs:                                                         │
│   ├── Continuous Monitoring (simulated readings for demo)       │
│   ├── Live Device (real ESP32 data via Firebase)                │
│   ├── Manual Entry (type vitals manually)                       │
│   └── Trends (charts + temporal analysis)                       │
│                                                                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND (Flask API)                           │
│                                                                 │
│   Receives vitals from frontend                                 │
│           │                                                     │
│           ▼                                                     │
│   ┌─────────────────────────────────────┐                       │
│   │  1. DATA VALIDATION                 │                       │
│   │     HR: 20-250 BPM                  │                       │
│   │     SpO2: 70-100%                   │                       │
│   │     Temp: 30-44°C                   │                       │
│   └──────────────┬──────────────────────┘                       │
│                  ▼                                               │
│   ┌─────────────────────────────────────┐                       │
│   │  2. DERIVED FEATURE COMPUTATION     │                       │
│   │                                     │                       │
│   │  From 3 sensor readings + age/bmi:  │                       │
│   │                                     │                       │
│   │  • SBP_est = 110 + 0.5×Age         │                       │
│   │             - 0.5×(BMI-22)          │                       │
│   │                                     │                       │
│   │  • Shock Index = HR / SBP_est       │                       │
│   │    (Allgower & Burri, 1967)         │                       │
│   │    >1.0 = haemodynamic instability  │                       │
│   │                                     │                       │
│   │  • Rate-Pressure Product            │                       │
│   │    = HR × (SBP/1000)               │                       │
│   │    (Robinson, 1967)                 │                       │
│   │    >12 = high cardiac workload      │                       │
│   │                                     │                       │
│   │  • Oxygen Delivery Index            │                       │
│   │    = (SpO2/100) × HR               │                       │
│   │    (Vincent et al., 2004)           │                       │
│   │    <60 = critical O2 delivery       │                       │
│   │                                     │                       │
│   │  • SpO2-Temp Risk Score             │                       │
│   │    = (1-SpO2/100)×100              │                       │
│   │      + max(0, Temp-37.5)×5         │                       │
│   │    >15 = critical combined risk     │                       │
│   │                                     │                       │
│   │  • BSA = 0.007184 × W^0.425        │                       │
│   │         × H^0.725                  │                       │
│   │    (DuBois & DuBois, 1916)         │                       │
│   │                                     │                       │
│   │  • MAP = DBP + (SBP-DBP)/3         │                       │
│   │    (SSC 2021)                       │                       │
│   │    <65 mmHg = septic shock          │                       │
│   │                                     │                       │
│   │  • RR Proxy = 1.5×(HR/SpO2)×100    │                       │
│   │    (Tarassenko et al., 2006)        │                       │
│   │                                     │                       │
│   │  • MEWS = score(HR) + score(RR)     │                       │
│   │         + score(Temp)               │                       │
│   │    (Subbe et al., QJM 2001)         │                       │
│   │    >=5 urgent, >=9 critical         │                       │
│   │                                     │                       │
│   └──────────────┬──────────────────────┘                       │
│                  ▼                                               │
│   ┌─────────────────────────────────────┐                       │
│   │  3. ML MODEL PREDICTION             │                       │
│   │                                     │                       │
│   │  Model: Random Forest               │                       │
│   │  - 150 trees, max_depth=13          │                       │
│   │  - 21 features (5 raw + 8 derived   │                       │
│   │    + 4 comorbidity + 4 encoded)     │                       │
│   │  - StandardScaler normalization     │                       │
│   │  - Trained on 4,752 records         │                       │
│   │  - 4% label noise for robustness    │                       │
│   │  - 95.3% test accuracy             │                       │
│   │                                     │                       │
│   │  Input features:                    │                       │
│   │  [age, bmi, heartRate, spO2, temp,  │                       │
│   │   gender_enc, activity_enc,         │                       │
│   │   age_group_enc, comorbidity_count, │                       │
│   │   has_hypertension, has_diabetes,   │                       │
│   │   has_copd, has_asthma,             │                       │
│   │   shock_index, rpp, odi, strs,      │                       │
│   │   bsa, map_est, rr_proxy, mews]     │                       │
│   │                                     │                       │
│   │  Output: 1 of 12 scenarios          │                       │
│   │  + confidence % for each            │                       │
│   │                                     │                       │
│   └──────────────┬──────────────────────┘                       │
│                  ▼                                               │
│   ┌─────────────────────────────────────┐                       │
│   │  4. RISK SCORING (0-100)            │                       │
│   │                                     │                       │
│   │  8 weighted components:             │                       │
│   │  • MEWS          (weight 5)         │                       │
│   │  • Shock Index   (weight 4)         │                       │
│   │  • ODI           (weight 4)         │                       │
│   │  • SpO2 direct   (weight 4)         │                       │
│   │  • STRS          (weight 3)         │                       │
│   │  • HR direct     (weight 3)         │                       │
│   │  • Temp direct   (weight 3)         │                       │
│   │  • MAP           (weight 2)         │                       │
│   │                                     │                       │
│   │  Score bands:                       │                       │
│   │  0-14  = LOW                        │                       │
│   │  15-34 = MEDIUM                     │                       │
│   │  35-59 = HIGH                       │                       │
│   │  60+   = CRITICAL                   │                       │
│   │                                     │                       │
│   │  Final risk = worst of              │                       │
│   │  (scenario base risk,               │                       │
│   │   vital-derived risk)               │                       │
│   │                                     │                       │
│   └──────────────┬──────────────────────┘                       │
│                  ▼                                               │
│   ┌─────────────────────────────────────┐                       │
│   │  5. RECOMMENDATION ENGINE           │                       │
│   │                                     │                       │
│   │  Two sources combined:              │                       │
│   │                                     │                       │
│   │  A) Scenario Clinical Protocol      │                       │
│   │     - Specific treatment steps      │                       │
│   │       for the predicted scenario    │                       │
│   │     - From GOLD, GINA, AHA, ESC,   │                       │
│   │       SSC, BTS, WHO guidelines      │                       │
│   │                                     │                       │
│   │  B) Real-time Vital Guidance        │                       │
│   │     - Rule-based checks on each     │                       │
│   │       vital sign independently      │                       │
│   │     - Patient-facing actions         │                       │
│   │     - SIRS screening                │                       │
│   │     - Paediatric-specific alerts    │                       │
│   │                                     │                       │
│   │  Overall urgency = worst of A + B   │                       │
│   │  (routine/watch/urgent/emergency)   │                       │
│   │                                     │                       │
│   └──────────────┬──────────────────────┘                       │
│                  ▼                                               │
│   ┌─────────────────────────────────────┐                       │
│   │  6. STORE IN SQLite                 │                       │
│   │     vitals + prediction + risk      │                       │
│   └─────────────────────────────────────┘                       │
│                                                                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                 RESPONSE BACK TO FRONTEND                        │
│                                                                 │
│   {                                                             │
│     prediction: "sepsis",                                       │
│     confidence: 0.87,                                           │
│     probabilities: { sepsis: 0.87, critical: 0.06, ... },       │
│     derived_vitals: {                                           │
│       shock_index: 1.1, odi: 82.5, strs: 18.2,                │
│       map_est: 71.5, rr_proxy: 190.3, mews: 6                 │
│     },                                                          │
│     risk: {                                                     │
│       category: "CRITICAL", numeric_score: 62.5,               │
│       flags: ["MEWS>=5", "SI>=1.0", "SpO2<94%"],              │
│       description: "Immediate life threat..."                   │
│     },                                                          │
│     recommendations: {                                          │
│       scenario_protocol: { steps: [...], ref: "SSC 2021" },    │
│       vital_guidance: [{ message, action, urgency, ref }],     │
│       overall_urgency: "emergency"                              │
│     }                                                           │
│   }                                                             │
│                                                                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              DISPLAYED TO DOCTOR / PATIENT                       │
│                                                                 │
│   Doctor sees:                                                  │
│   ├── All patients dashboard with latest status                 │
│   ├── Live vitals + AI prediction + risk category               │
│   ├── Derived parameters (SI, ODI, STRS, MAP, MEWS)           │
│   ├── Risk flags and clinical alerts                            │
│   ├── Scenario protocol (treatment steps with references)       │
│   ├── Trend charts (HR, SpO2, Temp over time)                  │
│   └── Full health assessment report                             │
│                                                                 │
│   Patient sees:                                                 │
│   ├── Personal health dashboard                                 │
│   ├── Current vitals and health status                          │
│   ├── Risk level and what it means                              │
│   ├── Patient-facing guidance (what to do)                      │
│   ├── Health trends                                             │
│   └── Their health report                                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 12 Clinical Scenarios Detected

| Scenario | Base Risk | Key Pattern |
|----------|-----------|-------------|
| Healthy | LOW | All vitals in normal range |
| Fever | MEDIUM | Temp elevated, proportional HR rise |
| Pneumonia | HIGH | SpO2 drop + fever + tachycardia |
| COPD Exacerbation | HIGH | SpO2 drop from baseline + HR elevation |
| Asthma Exacerbation | HIGH | Rapid SpO2 deterioration + HR spike |
| Respiratory Distress | HIGH | Compensatory tachycardia + SpO2 drop |
| Heart Failure | HIGH | Persistent low SpO2 + resting tachycardia |
| Hypertension Crisis | CRITICAL | Tachycardia in hypertensive patient |
| Cardiac Event | CRITICAL | HR abnormalities, SpO2 drop |
| Hypoxia | CRITICAL | SpO2 below threshold + compensatory HR |
| Sepsis | CRITICAL | HR + Temp both elevated (SIRS) |
| Critical | CRITICAL | Multiple vitals critically abnormal |

---

## File Structure

```
hmd/
│
├── MODEL3.PY                          # ML model + derived features + risk scoring
│                                        + recommendation engine (ALL AI logic here)
│
├── sketch_oct4a.ino                   # ESP32-S3 Arduino code (sensor reading + WiFi)
│
├── patient_data_comprehensive_*.csv   # Training dataset (4,752 records)
├── clinical_knowledge_base.docx       # Clinical reference document
│
├── trained_model.joblib               # Serialized Random Forest model
├── label_encoder.joblib               # Target label encoder
├── scaler.joblib                      # StandardScaler for features
├── label_encoders.joblib              # Gender/activity/age_group encoders
│
├── backend/
│   ├── app.py                         # Flask API server
│   │                                    - Auth (register/login, doctor/patient roles)
│   │                                    - Patient CRUD
│   │                                    - Vitals recording → ML prediction
│   │                                    - Report generation
│   │                                    - Trend analysis
│   ├── health_engine.py               # Utility (age_to_age_group)
│   ├── report_generator.py            # Legacy (report logic now in MODEL3)
│   ├── requirements.txt               # Python dependencies
│   └── hmd.db                         # SQLite database (auto-created)
│
├── frontend/
│   ├── src/
│   │   ├── main.jsx                   # App entry point
│   │   ├── App.jsx                    # Router (public pages + auth + role-based)
│   │   ├── firebase.js                # Firebase RTDB connection
│   │   ├── auth/
│   │   │   └── AuthContext.jsx        # Login state management
│   │   ├── api/
│   │   │   └── index.js              # All API calls to Flask backend
│   │   ├── components/
│   │   │   ├── Navbar.jsx             # Navigation (public + auth views)
│   │   │   ├── PatientForm.jsx        # Patient registration form
│   │   │   ├── VitalsRecorder.jsx     # Manual vital signs input
│   │   │   ├── VitalsChart.jsx        # HR/SpO2/Temp trend charts
│   │   │   ├── AlertsPanel.jsx        # Clinical alerts display
│   │   │   ├── LiveMonitor.jsx        # Real-time ESP32 data via Firebase
│   │   │   └── AutoMonitor.jsx        # Simulated continuous monitoring
│   │   └── pages/
│   │       ├── Home.jsx               # Public landing page
│   │       ├── Login.jsx              # Login page
│   │       ├── Register.jsx           # Register (doctor or patient)
│   │       ├── DoctorDashboard.jsx    # Doctor view (all patients)
│   │       ├── PatientDashboard.jsx   # Patient view (own data only)
│   │       ├── PatientDetail.jsx      # Full patient monitoring page
│   │       └── ReportView.jsx         # Health assessment report
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
├── firebase.json                      # Firebase Hosting config
├── .firebaserc                        # Firebase project link
├── Dockerfile                         # Backend container for Cloud Run
└── DEPLOY.md                          # Deployment guide
```

---

## How to Run Locally

```bash
# Terminal 1 — Backend
cd c:\Personal\hmd
pip install -r backend/requirements.txt
python MODEL3.PY          # Train model (first time only)
python backend/app.py     # Starts on http://localhost:5000

# Terminal 2 — Frontend
cd c:\Personal\hmd\frontend
npm install
npm run dev               # Starts on http://localhost:5173
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/register | Register doctor or patient |
| POST | /api/auth/login | Login |
| GET | /api/doctors | List all doctors |
| GET | /api/patients?doctor_id=1 | List patients for a doctor |
| POST | /api/patients | Create patient |
| POST | /api/patients/:id/vitals | Record vitals → returns prediction + risk + recommendations |
| GET | /api/patients/:id/vitals | Get vitals history |
| GET | /api/patients/:id/predict | Run prediction on latest vitals |
| GET | /api/patients/:id/trends | Temporal trend analysis |
| GET | /api/patients/:id/report | Full health assessment report |
| POST | /api/model/train | Train/retrain the ML model |
| GET | /api/model/status | Check if model is loaded |

---

## Clinical References

- Allgower & Burri, 1967 — Shock Index
- Robinson BF, 1967 — Rate-Pressure Product
- Vincent et al., Crit Care Med 2004 — Oxygen Delivery Index
- Tarassenko et al., Physiol Meas 2006 — RR Proxy
- DuBois & DuBois, Arch Intern Med 1916 — Body Surface Area
- Subbe et al., QJM 2001 — MEWS scoring
- Bone et al., Chest 1992 — SIRS criteria
- Surviving Sepsis Campaign 2021 — Sepsis, MAP, IV fluids
- GOLD Guidelines 2023 — COPD management
- GINA Guidelines 2023 — Asthma management
- AHA/ACC Chest Pain Guidelines 2021 — Cardiac events
- ESC Heart Failure Guidelines 2021 — Heart failure
- BTS Pneumonia Guidelines 2019 — Pneumonia management
- BTS Oxygen Guideline 2017 — Oxygen therapy
- WHO Self-Care Guidelines 2019 — Patient guidance
- WHO Fever Management Guidelines — Fever management
- NHS Patient Information Standards — Patient actions
