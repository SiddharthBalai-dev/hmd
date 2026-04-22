"""
app.py - Flask API server for Health Monitoring Device
Updated to use MongoDB Atlas instead of SQLite
"""

import sys
import os
import json
import hashlib
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask, request, jsonify
from flask_cors import CORS
from pymongo import MongoClient
from bson import ObjectId

import MODEL3
from health_engine import age_to_age_group

app = Flask(__name__)
CORS(app, origins=["https://healthmonitor-6685d.web.app", "http://localhost:5173"])

MONGO_URL = os.environ.get("MONGO_URL", "mongodb+srv://hmduser:hmd123456@hmd.kv3dpem.mongodb.net/?retryWrites=true&w=majority&appName=hmd")

client = MongoClient(MONGO_URL)
db = client["hmd"]

users_col = db["users"]
patients_col = db["patients"]
vitals_col = db["vitals"]

# Create indexes
users_col.create_index("email", unique=True)
patients_col.create_index("id", unique=True)
vitals_col.create_index("patient_id")

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

def serialize(doc):
    if doc is None:
        return None
    doc = dict(doc)
    if "_id" in doc:
        doc["_id"] = str(doc["_id"])
    return doc

# ── ML Model ──

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

# ── Routes ──

@app.route("/api/health", methods=["GET"])
def health_check():
    model, le = get_model()
    return jsonify({"status": "ok", "model_loaded": model is not None, "timestamp": datetime.now().isoformat()})

# ── Auth ──

@app.route("/api/auth/register", methods=["POST"])
def register():
    data = request.json
    for field in ["email", "password", "name", "role"]:
        if field not in data:
            return jsonify({"error": f"Missing required field: {field}"}), 400
    if data["role"] not in ("doctor", "patient"):
        return jsonify({"error": "Role must be 'doctor' or 'patient'"}), 400

    if users_col.find_one({"email": data["email"]}):
        return jsonify({"error": "Email already registered"}), 409

    doctor_id = None
    if data["role"] == "patient":
        raw_doctor_id = data.get("doctor_id")
        if raw_doctor_id:
            doctor_id = int(raw_doctor_id)
            if not users_col.find_one({"id": doctor_id, "role": "doctor"}):
                return jsonify({"error": "Invalid doctor code"}), 400

    # Auto increment id
    last = users_col.find_one(sort=[("id", -1)])
    new_id = (last["id"] + 1) if last and "id" in last else 1

    user_doc = {
        "id": new_id,
        "email": data["email"],
        "password_hash": hash_password(data["password"]),
        "name": data["name"],
        "role": data["role"],
        "doctor_id": doctor_id,
        "patient_link_id": None,
        "specialization": data.get("specialization", ""),
        "created_at": datetime.now().isoformat()
    }
    users_col.insert_one(user_doc)

    user = serialize(users_col.find_one({"id": new_id}))
    del user["password_hash"]

    if data["role"] == "patient" and all(k in data for k in ["age", "gender", "bmi"]):
        age_group = age_to_age_group(int(data["age"]))
        patient_link_id = f"P{new_id:06d}"
        try:
            patients_col.insert_one({
                "id": patient_link_id,
                "name": data["name"],
                "age": int(data["age"]),
                "age_group": age_group,
                "gender": data["gender"],
                "bmi": float(data["bmi"]),
                "comorbidities": data.get("comorbidities", ""),
                "activity_level": data.get("activity_level", "light"),
                "doctor_id": doctor_id,
                "device_id": "",
                "created_at": datetime.now().isoformat()
            })
            users_col.update_one({"id": new_id}, {"$set": {"patient_link_id": patient_link_id}})
            user["patient_link_id"] = patient_link_id
        except Exception:
            pass

    return jsonify(user), 201


@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.json
    if not data.get("email") or not data.get("password"):
        return jsonify({"error": "Email and password required"}), 400

    user = users_col.find_one({"email": data["email"]})
    if not user or user["password_hash"] != hash_password(data["password"]):
        return jsonify({"error": "Invalid email or password"}), 401

    user_dict = serialize(user)
    del user_dict["password_hash"]

    if user_dict["role"] == "doctor":
        user_dict["patient_count"] = patients_col.count_documents({"doctor_id": user_dict["id"]})

    if user_dict["role"] == "patient":
        fresh_user = users_col.find_one({"id": user_dict["id"]})
        user_dict["patient_link_id"] = fresh_user.get("patient_link_id") if fresh_user else None

    return jsonify(user_dict)


@app.route("/api/auth/user/<int:user_id>", methods=["GET"])
def get_user(user_id):
    user = users_col.find_one({"id": user_id})
    if not user:
        return jsonify({"error": "User not found"}), 404
    user_dict = serialize(user)
    del user_dict["password_hash"]
    return jsonify(user_dict)


# ── Doctors ──

@app.route("/api/doctors", methods=["GET"])
def list_doctors():
    doctors = users_col.find({"role": "doctor"}, {"password_hash": 0})
    return jsonify([serialize(d) for d in doctors])


# ── Patients ──

@app.route("/api/patients", methods=["GET"])
def list_patients():
    doctor_id = request.args.get("doctor_id", type=int)
    patient_link_id = request.args.get("patient_link_id")

    if patient_link_id:
        query = {"id": patient_link_id}
    elif doctor_id:
        query = {"doctor_id": doctor_id}
    else:
        query = {}

    patients = list(patients_col.find(query).sort("created_at", -1))
    result = []
    for p in patients:
        p_dict = serialize(p)
        latest = vitals_col.find_one({"patient_id": p["id"]}, sort=[("timestamp", -1)])
        count = vitals_col.count_documents({"patient_id": p["id"]})
        p_dict["latest_vitals"] = serialize(latest)
        p_dict["readings_count"] = count
        result.append(p_dict)
    return jsonify(result)


@app.route("/api/patients", methods=["POST"])
def create_patient():
    data = request.json
    for field in ["name", "age", "gender", "bmi"]:
        if field not in data:
            return jsonify({"error": f"Missing required field: {field}"}), 400

    patient_id = data.get("id", f"P{datetime.now().strftime('%H%M%S%f')[:8]}")
    age_group = age_to_age_group(int(data["age"]))

    if patients_col.find_one({"id": patient_id}):
        return jsonify({"error": "Patient ID already exists"}), 409

    patient_doc = {
        "id": patient_id,
        "name": data["name"],
        "age": int(data["age"]),
        "age_group": age_group,
        "gender": data["gender"],
        "bmi": float(data["bmi"]),
        "comorbidities": data.get("comorbidities", ""),
        "activity_level": data.get("activity_level", "light"),
        "doctor_id": data.get("doctor_id"),
        "device_id": data.get("device_id", ""),
        "created_at": datetime.now().isoformat()
    }
    patients_col.insert_one(patient_doc)
    return jsonify(serialize(patients_col.find_one({"id": patient_id}))), 201


@app.route("/api/patients/<patient_id>/device", methods=["PUT"])
def update_patient_device(patient_id):
    data = request.json
    result = patients_col.find_one_and_update(
        {"id": patient_id},
        {"$set": {"device_id": data.get("device_id", "")}},
        return_document=True
    )
    if not result:
        return jsonify({"error": "Patient not found"}), 404
    return jsonify(serialize(result))


@app.route("/api/patients/<patient_id>", methods=["GET"])
def get_patient(patient_id):
    patient = patients_col.find_one({"id": patient_id})
    if not patient:
        return jsonify({"error": "Patient not found"}), 404
    p_dict = serialize(patient)
    p_dict["readings_count"] = vitals_col.count_documents({"patient_id": patient_id})
    return jsonify(p_dict)


@app.route("/api/patients/<patient_id>", methods=["DELETE"])
def delete_patient(patient_id):
    vitals_col.delete_many({"patient_id": patient_id})
    patients_col.delete_one({"id": patient_id})
    return jsonify({"status": "deleted"})


# ── Vitals ──

@app.route("/api/patients/<patient_id>/vitals", methods=["POST"])
def record_vitals(patient_id):
    patient = patients_col.find_one({"id": patient_id})
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

    if hr < 20 or hr > 250:
        return jsonify({"error": "Heart rate out of valid range"}), 422
    if spo2 < 70 or spo2 > 100:
        return jsonify({"error": "SpO2 out of valid range"}), 422
    if temp < 30 or temp > 44:
        return jsonify({"error": "Temperature out of valid range"}), 422

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

    risk_score = prediction_result["risk"]["numeric_score"] if prediction_result else 0

    vitals_col.insert_one({
        "patient_id": patient_id,
        "heart_rate": hr,
        "spo2": spo2,
        "temperature": temp,
        "timestamp": timestamp,
        "prediction": prediction_result["prediction"] if prediction_result else None,
        "confidence": prediction_result["confidence"] if prediction_result else None,
        "news2_score": int(risk_score),
        "assessment_json": json.dumps(prediction_result) if prediction_result else None
    })

    return jsonify({
        "vitals": {"heartRate": hr, "spO2": spo2, "temperature": temp, "timestamp": timestamp},
        "prediction": prediction_result,
    }), 201


@app.route("/api/patients/<patient_id>/vitals", methods=["GET"])
def get_vitals(patient_id):
    limit = request.args.get("limit", 100, type=int)
    vitals = list(vitals_col.find({"patient_id": patient_id}).sort("timestamp", -1).limit(limit))
    result = []
    for v in vitals:
        v_dict = serialize(v)
        if v_dict.get("assessment_json"):
            v_dict["assessment"] = json.loads(v_dict["assessment_json"])
            del v_dict["assessment_json"]
        result.append(v_dict)
    result.reverse()
    return jsonify(result)


# ── Predictions ──

@app.route("/api/patients/<patient_id>/predict", methods=["GET"])
def predict_patient(patient_id):
    patient = patients_col.find_one({"id": patient_id})
    if not patient:
        return jsonify({"error": "Patient not found"}), 404
    latest = vitals_col.find_one({"patient_id": patient_id}, sort=[("timestamp", -1)])
    if not latest:
        return jsonify({"error": "No vitals recorded"}), 404
    model, le = get_model()
    if model is None:
        return jsonify({"error": "Model not trained yet."}), 503
    reading = {
        "heartRate": latest["heart_rate"], "spO2": latest["spo2"],
        "temperature": latest["temperature"],
        "age": patient["age"], "age_group": patient["age_group"],
        "gender": patient["gender"], "bmi": patient["bmi"],
        "comorbidities": patient["comorbidities"],
        "activity_level": patient["activity_level"],
    }
    return jsonify(MODEL3.predict_single(reading, model, le))


# ── Trends ──

@app.route("/api/patients/<patient_id>/trends", methods=["GET"])
def get_trends(patient_id):
    if not patients_col.find_one({"id": patient_id}):
        return jsonify({"error": "Patient not found"}), 404
    vitals = list(vitals_col.find({"patient_id": patient_id}).sort("timestamp", 1).limit(50))
    if len(vitals) < 2:
        return jsonify({"error": "Need at least 2 readings"}), 400
    readings_list = [{"heartRate": v["heart_rate"], "spO2": v["spo2"], "temperature": v["temperature"], "timestamp": v["timestamp"]} for v in vitals]
    return jsonify(MODEL3.compute_temporal_features(readings_list))


# ── Reports ──

@app.route("/api/patients/<patient_id>/report", methods=["GET"])
def generate_patient_report(patient_id):
    patient = patients_col.find_one({"id": patient_id})
    if not patient:
        return jsonify({"error": "Patient not found"}), 404
    vitals = list(vitals_col.find({"patient_id": patient_id}).sort("timestamp", 1))
    if not vitals:
        return jsonify({"error": "No vitals recorded"}), 404
    latest = vitals[-1]
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
    readings_list = [{"heartRate": v["heart_rate"], "spO2": v["spo2"], "temperature": v["temperature"], "timestamp": v["timestamp"]} for v in vitals]
    trend_data = MODEL3.compute_temporal_features(readings_list) if len(readings_list) >= 2 else None
    from datetime import datetime as dt
    return jsonify({
        "report_id": f"RPT-{dt.now().strftime('%Y%m%d%H%M%S')}",
        "generated_at": dt.now().isoformat(),
        "patient": {"id": patient["id"], "name": patient["name"], "age": patient["age"], "age_group": patient["age_group"], "gender": patient["gender"], "bmi": patient["bmi"], "comorbidities": patient["comorbidities"]},
        "vitals_summary": {"heart_rate": latest["heart_rate"], "spo2": latest["spo2"], "temperature": latest["temperature"]},
        "prediction": prediction_result,
        "trends": trend_data,
        "readings_count": len(vitals),
        "disclaimer": "This report is generated by an AI-based clinical decision support system. It does not replace professional medical advice.",
    })


# ── Model ──

@app.route("/api/model/train", methods=["POST"])
def train_model_endpoint():
    global _model, _le
    try:
        model, le, acc = MODEL3.train_model()
        _model = model
        _le = le
        return jsonify({"status": "trained", "accuracy": round(acc, 4), "classes": list(le.classes_)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/model/status", methods=["GET"])
def model_status():
    model, le = get_model()
    if model is None:
        return jsonify({"status": "not_trained", "classes": []})
    return jsonify({"status": "ready", "classes": list(le.classes_)})


@app.route("/api/dataset/stats", methods=["GET"])
def dataset_stats():
    import pandas as pd
    try:
        df = pd.read_csv(MODEL3.CSV_PATH)
        return jsonify({"total_records": len(df), "scenarios": {k: int(v) for k, v in df["scenario"].value_counts().items()}})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    print("Starting Flask server on http://localhost:5000")
    app.run(debug=True, port=5000, host="0.0.0.0")
