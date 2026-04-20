"""
app.py - Flask API server for Health Monitoring Device
"""

import sys
import os
import sqlite3
import json
import hashlib
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Flask, request, jsonify, g
from flask_cors import CORS

import MODEL3
from backend.health_engine import age_to_age_group

app = Flask(__name__)
CORS(app)

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hmd.db")

# ── Database setup ──

def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(exception):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()


def init_db():
    db = sqlite3.connect(DB_PATH)
    db.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('doctor', 'patient')),
            doctor_id INTEGER,
            patient_link_id TEXT,
            specialization TEXT DEFAULT '',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (doctor_id) REFERENCES users(id)
        )
    """)
    db.execute("""
        CREATE TABLE IF NOT EXISTS patients (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            age INTEGER NOT NULL,
            age_group TEXT NOT NULL,
            gender TEXT NOT NULL,
            bmi REAL NOT NULL,
            comorbidities TEXT DEFAULT '',
            activity_level TEXT DEFAULT 'light',
            doctor_id INTEGER,
            device_id TEXT DEFAULT '',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (doctor_id) REFERENCES users(id)
        )
    """)
    db.execute("""
        CREATE TABLE IF NOT EXISTS vitals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id TEXT NOT NULL,
            heart_rate REAL NOT NULL,
            spo2 REAL NOT NULL,
            temperature REAL NOT NULL,
            timestamp TEXT NOT NULL,
            prediction TEXT,
            confidence REAL,
            news2_score INTEGER,
            assessment_json TEXT,
            FOREIGN KEY (patient_id) REFERENCES patients(id)
        )
    """)
    # Add doctor_id column to patients if missing (migration for existing DBs)
    try:
        db.execute("ALTER TABLE patients ADD COLUMN doctor_id INTEGER")
    except sqlite3.OperationalError:
        pass
    # Add device_id column for linking ESP32 devices
    try:
        db.execute("ALTER TABLE patients ADD COLUMN device_id TEXT DEFAULT ''")
    except sqlite3.OperationalError:
        pass
    db.commit()
    db.close()


# ── ML Model state ──

_model = None
_le = None


def get_model():
    global _model, _le
    if _model is None:
        try:
            _model, _le = MODEL3.load_model()
        except FileNotFoundError:
            return None, None
    return _model, _le


# ── API Routes ──

@app.route("/api/health", methods=["GET"])
def health_check():
    model, le = get_model()
    return jsonify({
        "status": "ok",
        "model_loaded": model is not None,
        "timestamp": datetime.now().isoformat(),
    })


# ── Auth ──

@app.route("/api/auth/register", methods=["POST"])
def register():
    data = request.json
    required = ["email", "password", "name", "role"]
    for field in required:
        if field not in data:
            return jsonify({"error": f"Missing required field: {field}"}), 400

    if data["role"] not in ("doctor", "patient"):
        return jsonify({"error": "Role must be 'doctor' or 'patient'"}), 400

    db = get_db()

    # Check if email exists
    existing = db.execute("SELECT id FROM users WHERE email = ?", (data["email"],)).fetchone()
    if existing:
        return jsonify({"error": "Email already registered"}), 409

    doctor_id = None
    patient_link_id = None

    if data["role"] == "patient":
        # Patient must provide a doctor code (doctor's user ID) to link
        doctor_id = data.get("doctor_id")
        if doctor_id:
            doc = db.execute("SELECT id FROM users WHERE id = ? AND role = 'doctor'", (doctor_id,)).fetchone()
            if not doc:
                return jsonify({"error": "Invalid doctor code"}), 400

    db.execute(
        """INSERT INTO users (email, password_hash, name, role, doctor_id, specialization)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (data["email"], hash_password(data["password"]), data["name"],
         data["role"], doctor_id, data.get("specialization", ""))
    )
    db.commit()

    user = db.execute("SELECT * FROM users WHERE email = ?", (data["email"],)).fetchone()
    user_dict = dict(user)
    del user_dict["password_hash"]

    # If registering as patient, also create a patient record automatically
    if data["role"] == "patient" and all(k in data for k in ["age", "gender", "bmi"]):
        age_group = age_to_age_group(int(data["age"]))
        patient_link_id = f"P{user_dict['id']:06d}"
        try:
            db.execute(
                "INSERT INTO patients (id, name, age, age_group, gender, bmi, comorbidities, activity_level, doctor_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (patient_link_id, data["name"], int(data["age"]), age_group,
                 data["gender"], float(data["bmi"]),
                 data.get("comorbidities", ""), data.get("activity_level", "light"),
                 doctor_id)
            )
            db.execute("UPDATE users SET patient_link_id = ? WHERE id = ?", (patient_link_id, user_dict["id"]))
            db.commit()
            user_dict["patient_link_id"] = patient_link_id
        except sqlite3.IntegrityError:
            pass

    return jsonify(user_dict), 201


@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.json
    if not data.get("email") or not data.get("password"):
        return jsonify({"error": "Email and password required"}), 400

    db = get_db()
    user = db.execute("SELECT * FROM users WHERE email = ?", (data["email"],)).fetchone()
    if not user or user["password_hash"] != hash_password(data["password"]):
        return jsonify({"error": "Invalid email or password"}), 401

    user_dict = dict(user)
    del user_dict["password_hash"]

    # For doctors, include patient count
    if user_dict["role"] == "doctor":
        count = db.execute(
            "SELECT COUNT(*) as cnt FROM patients WHERE doctor_id = ?", (user_dict["id"],)
        ).fetchone()["cnt"]
        user_dict["patient_count"] = count

    return jsonify(user_dict)


@app.route("/api/auth/user/<int:user_id>", methods=["GET"])
def get_user(user_id):
    db = get_db()
    user = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not user:
        return jsonify({"error": "User not found"}), 404
    user_dict = dict(user)
    del user_dict["password_hash"]
    return jsonify(user_dict)


# ── Doctors ──

@app.route("/api/doctors", methods=["GET"])
def list_doctors():
    """List all doctors (for patient registration dropdown)."""
    db = get_db()
    doctors = db.execute("SELECT id, name, specialization FROM users WHERE role = 'doctor' ORDER BY name").fetchall()
    return jsonify([dict(d) for d in doctors])


# ── Patients ──

@app.route("/api/patients", methods=["GET"])
def list_patients():
    db = get_db()
    doctor_id = request.args.get("doctor_id", type=int)
    patient_link_id = request.args.get("patient_link_id")

    if patient_link_id:
        # Patient viewing their own record
        patients = db.execute("SELECT * FROM patients WHERE id = ?", (patient_link_id,)).fetchall()
    elif doctor_id:
        # Doctor viewing their patients
        patients = db.execute("SELECT * FROM patients WHERE doctor_id = ? ORDER BY created_at DESC", (doctor_id,)).fetchall()
    else:
        patients = db.execute("SELECT * FROM patients ORDER BY created_at DESC").fetchall()

    result = []
    for p in patients:
        p_dict = dict(p)
        latest = db.execute(
            "SELECT * FROM vitals WHERE patient_id = ? ORDER BY timestamp DESC LIMIT 1",
            (p["id"],)
        ).fetchone()
        count = db.execute(
            "SELECT COUNT(*) as cnt FROM vitals WHERE patient_id = ?",
            (p["id"],)
        ).fetchone()["cnt"]
        p_dict["latest_vitals"] = dict(latest) if latest else None
        p_dict["readings_count"] = count
        result.append(p_dict)
    return jsonify(result)


@app.route("/api/patients", methods=["POST"])
def create_patient():
    data = request.json
    required = ["name", "age", "gender", "bmi"]
    for field in required:
        if field not in data:
            return jsonify({"error": f"Missing required field: {field}"}), 400

    patient_id = data.get("id", f"P{datetime.now().strftime('%H%M%S%f')[:8]}")
    age_group = age_to_age_group(int(data["age"]))

    db = get_db()
    try:
        db.execute(
            "INSERT INTO patients (id, name, age, age_group, gender, bmi, comorbidities, activity_level, doctor_id, device_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (patient_id, data["name"], int(data["age"]), age_group,
             data["gender"], float(data["bmi"]),
             data.get("comorbidities", ""), data.get("activity_level", "light"),
             data.get("doctor_id"), data.get("device_id", ""))
        )
        db.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "Patient ID already exists"}), 409

    patient = db.execute("SELECT * FROM patients WHERE id = ?", (patient_id,)).fetchone()
    return jsonify(dict(patient)), 201


@app.route("/api/patients/<patient_id>/device", methods=["PUT"])
def update_patient_device(patient_id):
    """Link or unlink an ESP32 device to a patient."""
    data = request.json
    device_id = data.get("device_id", "")
    db = get_db()
    db.execute("UPDATE patients SET device_id = ? WHERE id = ?", (device_id, patient_id))
    db.commit()
    patient = db.execute("SELECT * FROM patients WHERE id = ?", (patient_id,)).fetchone()
    if not patient:
        return jsonify({"error": "Patient not found"}), 404
    return jsonify(dict(patient))


@app.route("/api/patients/<patient_id>", methods=["GET"])
def get_patient(patient_id):
    db = get_db()
    patient = db.execute("SELECT * FROM patients WHERE id = ?", (patient_id,)).fetchone()
    if not patient:
        return jsonify({"error": "Patient not found"}), 404

    p_dict = dict(patient)
    count = db.execute(
        "SELECT COUNT(*) as cnt FROM vitals WHERE patient_id = ?", (patient_id,)
    ).fetchone()["cnt"]
    p_dict["readings_count"] = count
    return jsonify(p_dict)


@app.route("/api/patients/<patient_id>", methods=["DELETE"])
def delete_patient(patient_id):
    db = get_db()
    db.execute("DELETE FROM vitals WHERE patient_id = ?", (patient_id,))
    db.execute("DELETE FROM patients WHERE id = ?", (patient_id,))
    db.commit()
    return jsonify({"status": "deleted"})


# ── Vitals ──

@app.route("/api/patients/<patient_id>/vitals", methods=["POST"])
def record_vitals(patient_id):
    db = get_db()
    patient = db.execute("SELECT * FROM patients WHERE id = ?", (patient_id,)).fetchone()
    if not patient:
        return jsonify({"error": "Patient not found"}), 404

    data = request.json
    for field in ["heartRate", "spO2", "temperature"]:
        if field not in data:
            return jsonify({"error": f"Missing required field: {field}"}), 400

    hr = float(data["heartRate"])
    spo2 = float(data["spO2"])
    temp = float(data["temperature"])
    timestamp = data.get("timestamp", datetime.now().isoformat())

    # Data quality validation (Section 11 of knowledge base)
    if hr < 20 or hr > 250:
        return jsonify({"error": "Heart rate out of valid range (20-250 BPM) - possible sensor artifact"}), 422
    if spo2 < 70 or spo2 > 100:
        return jsonify({"error": "SpO2 out of valid range (70-100%) - sensor error"}), 422
    if temp < 30 or temp > 44:
        return jsonify({"error": "Temperature out of valid range (30-44°C) - outside survival limits"}), 422

    # ML Prediction (includes risk, recommendations, derived vitals)
    prediction_result = None
    model, le = get_model()
    if model is not None:
        reading = {
            "heartRate": hr, "spO2": spo2, "temperature": temp,
            "age": patient["age"], "age_group": patient["age_group"],
            "gender": patient["gender"], "bmi": patient["bmi"],
            "comorbidities": patient["comorbidities"],
            "activity_level": patient["activity_level"],
        }
        prediction_result = MODEL3.predict_single(reading, model, le)

    # Risk score for DB storage
    risk_score = prediction_result["risk"]["numeric_score"] if prediction_result else 0

    # Store in DB
    db.execute(
        """INSERT INTO vitals (patient_id, heart_rate, spo2, temperature, timestamp,
           prediction, confidence, news2_score, assessment_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (patient_id, hr, spo2, temp, timestamp,
         prediction_result["prediction"] if prediction_result else None,
         prediction_result["confidence"] if prediction_result else None,
         int(risk_score),
         json.dumps(prediction_result) if prediction_result else None)
    )
    db.commit()

    return jsonify({
        "vitals": {"heartRate": hr, "spO2": spo2, "temperature": temp, "timestamp": timestamp},
        "prediction": prediction_result,
    }), 201


@app.route("/api/patients/<patient_id>/vitals", methods=["GET"])
def get_vitals(patient_id):
    db = get_db()
    limit = request.args.get("limit", 100, type=int)
    vitals = db.execute(
        "SELECT * FROM vitals WHERE patient_id = ? ORDER BY timestamp DESC LIMIT ?",
        (patient_id, limit)
    ).fetchall()
    result = []
    for v in vitals:
        v_dict = dict(v)
        if v_dict.get("assessment_json"):
            v_dict["assessment"] = json.loads(v_dict["assessment_json"])
            del v_dict["assessment_json"]
        result.append(v_dict)
    # Return in chronological order
    result.reverse()
    return jsonify(result)


# ── Predictions ──

@app.route("/api/patients/<patient_id>/predict", methods=["GET"])
def predict_patient(patient_id):
    """Run ML prediction on the latest vitals reading."""
    db = get_db()
    patient = db.execute("SELECT * FROM patients WHERE id = ?", (patient_id,)).fetchone()
    if not patient:
        return jsonify({"error": "Patient not found"}), 404

    latest = db.execute(
        "SELECT * FROM vitals WHERE patient_id = ? ORDER BY timestamp DESC LIMIT 1",
        (patient_id,)
    ).fetchone()
    if not latest:
        return jsonify({"error": "No vitals recorded for this patient"}), 404

    model, le = get_model()
    if model is None:
        return jsonify({"error": "Model not trained yet. POST /api/model/train first."}), 503

    reading = {
        "heartRate": latest["heart_rate"], "spO2": latest["spo2"],
        "temperature": latest["temperature"],
        "age": patient["age"], "age_group": patient["age_group"],
        "gender": patient["gender"], "bmi": patient["bmi"],
        "comorbidities": patient["comorbidities"],
        "activity_level": patient["activity_level"],
    }
    result = MODEL3.predict_single(reading, model, le)
    return jsonify(result)


# ── Trends ──

@app.route("/api/patients/<patient_id>/trends", methods=["GET"])
def get_trends(patient_id):
    """Compute temporal trend analysis for a patient."""
    db = get_db()
    patient = db.execute("SELECT * FROM patients WHERE id = ?", (patient_id,)).fetchone()
    if not patient:
        return jsonify({"error": "Patient not found"}), 404

    vitals = db.execute(
        "SELECT * FROM vitals WHERE patient_id = ? ORDER BY timestamp ASC LIMIT 50",
        (patient_id,)
    ).fetchall()

    if len(vitals) < 2:
        return jsonify({"error": "Need at least 2 readings for trend analysis"}), 400

    readings_list = [
        {"heartRate": v["heart_rate"], "spO2": v["spo2"],
         "temperature": v["temperature"], "timestamp": v["timestamp"]}
        for v in vitals
    ]

    trend_data = MODEL3.compute_temporal_features(readings_list)
    return jsonify(trend_data)


# ── Reports ──

@app.route("/api/patients/<patient_id>/report", methods=["GET"])
def generate_patient_report(patient_id):
    """Generate comprehensive health report for a patient."""
    db = get_db()
    patient = db.execute("SELECT * FROM patients WHERE id = ?", (patient_id,)).fetchone()
    if not patient:
        return jsonify({"error": "Patient not found"}), 404

    vitals = db.execute(
        "SELECT * FROM vitals WHERE patient_id = ? ORDER BY timestamp ASC",
        (patient_id,)
    ).fetchall()
    if not vitals:
        return jsonify({"error": "No vitals recorded for this patient"}), 404

    latest = vitals[-1]

    # Prediction with risk + recommendations
    model, le = get_model()
    prediction_result = None
    if model is not None:
        reading = {
            "heartRate": latest["heart_rate"], "spO2": latest["spo2"],
            "temperature": latest["temperature"],
            "age": patient["age"], "age_group": patient["age_group"],
            "gender": patient["gender"], "bmi": patient["bmi"],
            "comorbidities": patient["comorbidities"],
            "activity_level": patient["activity_level"],
        }
        prediction_result = MODEL3.predict_single(reading, model, le)

    # Trends
    readings_list = [
        {"heartRate": v["heart_rate"], "spO2": v["spo2"],
         "temperature": v["temperature"], "timestamp": v["timestamp"]}
        for v in vitals
    ]
    trend_data = None
    if len(readings_list) >= 2:
        trend_data = MODEL3.compute_temporal_features(readings_list)

    # Build report
    from datetime import datetime as dt
    report = {
        "report_id": f"RPT-{dt.now().strftime('%Y%m%d%H%M%S')}",
        "generated_at": dt.now().isoformat(),
        "patient": {
            "id": patient["id"], "name": patient["name"],
            "age": patient["age"], "age_group": patient["age_group"],
            "gender": patient["gender"], "bmi": patient["bmi"],
            "comorbidities": patient["comorbidities"],
        },
        "vitals_summary": {
            "heart_rate": latest["heart_rate"],
            "spo2": latest["spo2"],
            "temperature": latest["temperature"],
        },
        "prediction": prediction_result,
        "trends": trend_data,
        "readings_count": len(vitals),
        "disclaimer": "This report is generated by an AI-based clinical decision support system. It does not replace professional medical advice. Always consult a qualified doctor for diagnosis and treatment.",
    }

    return jsonify(report)


# ── Model management ──

@app.route("/api/model/train", methods=["POST"])
def train_model_endpoint():
    """Train/retrain the ML model."""
    global _model, _le
    try:
        model, le, acc = MODEL3.train_model()
        _model = model
        _le = le
        return jsonify({
            "status": "trained",
            "accuracy": round(acc, 4),
            "classes": list(le.classes_),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/model/status", methods=["GET"])
def model_status():
    model, le = get_model()
    if model is None:
        return jsonify({"status": "not_trained", "classes": []})
    return jsonify({
        "status": "ready",
        "classes": list(le.classes_),
    })


# ── Dataset stats ──

@app.route("/api/dataset/stats", methods=["GET"])
def dataset_stats():
    """Return stats about the training dataset."""
    import pandas as pd
    try:
        df = pd.read_csv(MODEL3.CSV_PATH)
        return jsonify({
            "total_records": len(df),
            "scenarios": {k: int(v) for k, v in df["scenario"].value_counts().items()},
            "age_groups": {k: int(v) for k, v in df["age_group"].value_counts().items()},
            "gender_distribution": {k: int(v) for k, v in df["gender"].value_counts().items()},
            "vitals_ranges": {
                "heartRate": {"min": float(df["heartRate"].min()), "max": float(df["heartRate"].max()), "mean": round(float(df["heartRate"].mean()), 1)},
                "spO2": {"min": float(df["spO2"].min()), "max": float(df["spO2"].max()), "mean": round(float(df["spO2"].mean()), 1)},
                "temperature": {"min": float(df["temperature"].min()), "max": float(df["temperature"].max()), "mean": round(float(df["temperature"].mean()), 1)},
            },
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    init_db()
    print("Initializing database...")

    # Auto-train model if not already trained
    model, le = get_model()
    if model is None:
        print("No trained model found. Training now...")
        try:
            _model, _le, acc = MODEL3.train_model()
            print(f"Model trained with accuracy: {acc:.4f}")
        except Exception as e:
            print(f"Warning: Could not train model: {e}")
            print("Start the server anyway. Train via POST /api/model/train")
    else:
        print("Loaded pre-trained model.")

    print("\nStarting Flask server on http://localhost:5000")
    app.run(debug=True, port=5000, host="0.0.0.0")
