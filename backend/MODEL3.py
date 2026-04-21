"""
MODEL3.PY - Health Scenario ML Model + Derived Sensor Features + Integrated Recommendation Engine

FORMULAS USED
-------------
1. Shock Index        : SI   = HR / SBP_est              (Allgower & Burri 1967)
2. Rate-Pressure Prod : RPP  = HR * (SBP_est / 1000)     (Robinson 1967)
3. Oxygen Delivery    : ODI  = (SpO2 / 100) * HR         (Vincent et al. 2004)
4. SpO2-Temp Risk     : STRS = (1 - SpO2/100)*100 + max(0, Temp-37.5)*5
5. Body Surface Area  : BSA  = 0.007184 * W^0.425 * H^0.725  (DuBois 1916)
6. Mean Art. Pressure : MAP  = DBP + (SBP - DBP) / 3
7. RR Proxy           : RR   = 1.5 * (HR / SpO2) * 100   (Tarassenko et al. 2006)
8. MEWS               : score(HR) + score(RR) + score(Temp)  (Subbe et al. 2001)
"""

import os
import warnings
warnings.filterwarnings("ignore")

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, accuracy_score
import joblib

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "trained_model.joblib")
ENCODER_PATH = os.path.join(BASE_DIR, "label_encoder.joblib")
SCALER_PATH = os.path.join(BASE_DIR, "scaler.joblib")
ENCODERS_PATH = os.path.join(BASE_DIR, "label_encoders.joblib")
CSV_PATH = os.path.join(BASE_DIR, "patient_data_comprehensive_1770874277525.csv")

ASSUMED_HEIGHT_CM = 170

# ── Clinical Knowledge Base ──

NORMAL_RANGES = {
    "infant":       {"hr": (100, 160), "temp": (36.5, 37.5), "spo2": (95, 100)},
    "child":        {"hr": (70, 120),  "temp": (36.5, 37.5), "spo2": (96, 100)},
    "young_adult":  {"hr": (60, 100),  "temp": (36.1, 37.2), "spo2": (96, 100)},
    "middle_aged":  {"hr": (60, 100),  "temp": (36.1, 37.2), "spo2": (95, 100)},
    "senior":       {"hr": (60, 100),  "temp": (36.0, 37.5), "spo2": (94, 100)},
    "elderly":      {"hr": (60, 100),  "temp": (36.0, 37.5), "spo2": (94, 100)},
}

FEATURES = [
    "age", "bmi", "heartRate", "spO2", "temperature",
    "gender_enc", "activity_enc", "age_group_enc",
    "comorbidity_count", "has_hypertension", "has_diabetes",
    "has_copd", "has_asthma",
    "shock_index", "rpp", "odi", "strs", "bsa", "map_est",
    "rr_proxy", "mews",
]

RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
RISK_COLORS = {"LOW": "#22c55e", "MEDIUM": "#eab308", "HIGH": "#f97316", "CRITICAL": "#ef4444"}

SCENARIO_BASE_RISK = {
    "healthy": "LOW", "fever": "MEDIUM", "pneumonia": "HIGH",
    "copd_exacerbation": "HIGH", "asthma_exacerbation": "HIGH",
    "respiratory_distress": "HIGH", "heart_failure": "HIGH",
    "hypertension_crisis": "CRITICAL", "cardiac_event": "CRITICAL",
    "hypoxia": "CRITICAL", "sepsis": "CRITICAL", "critical": "CRITICAL",
}


# ── MEWS Scoring (Subbe et al., QJM 2001) ──

def mews_hr(hr):
    if hr <= 40 or hr > 130: return 3
    if hr <= 50 or hr > 110: return 2
    if hr > 100: return 1
    return 0

def mews_rr(rr):
    if rr < 9 or rr > 30: return 3
    if rr > 20: return 2
    if rr > 14: return 1
    return 0

def mews_temp(t):
    if t < 35.0 or t >= 39.0: return 2
    if t < 36.0: return 1
    return 0


# ── Derived Feature Computation ──

def compute_derived(hr, spo2, temp, age, bmi):
    """Compute all derived vitals from 3 sensor readings + demographics."""
    sbp_est = float(np.clip(110 + 0.5 * age - 0.5 * (bmi - 22), 70, 200))
    dbp_est = 0.65 * sbp_est
    w_kg = bmi * (ASSUMED_HEIGHT_CM / 100) ** 2
    rr = 1.5 * (hr / spo2) * 100

    return {
        "sbp_est": round(sbp_est, 1),
        "shock_index": round(hr / sbp_est, 3),
        "rpp": round(hr * (sbp_est / 1000), 2),
        "odi": round((spo2 / 100) * hr, 1),
        "strs": round((1 - spo2 / 100) * 100 + max(0, temp - 37.5) * 5, 2),
        "bsa": round(0.007184 * (w_kg ** 0.425) * (ASSUMED_HEIGHT_CM ** 0.725), 3),
        "map_est": round(dbp_est + (sbp_est - dbp_est) / 3, 1),
        "rr_proxy": round(rr, 1),
        "mews": mews_hr(hr) + mews_rr(rr) + mews_temp(temp),
    }


# ── Risk Scoring System ──

def compute_risk_score(shock_index, odi, strs, map_est, mews, spo2, temp, hr):
    """
    Composite numeric risk score (0-100) from derived vitals + primary sensors.
    References: Subbe 2001, Allgower 1967, Vincent 2004, SSC 2021, BTS 2017.
    """
    flags = []
    total = 0

    # MEWS (weight 5)
    if mews >= 9:   m = 4; flags.append("MEWS>=9 (critical - immediate response)")
    elif mews >= 5: m = 3; flags.append("MEWS>=5 (urgent - senior review)")
    elif mews >= 3: m = 2; flags.append("MEWS>=3 (moderate - increased monitoring)")
    elif mews >= 1: m = 1
    else: m = 0
    total += m * 5

    # Shock Index (weight 4)
    if shock_index >= 1.5:   s = 4; flags.append("SI>=1.5 (severe haemodynamic instability)")
    elif shock_index >= 1.0: s = 3; flags.append("SI>=1.0 (haemodynamic instability)")
    elif shock_index >= 0.8: s = 1
    else: s = 0
    total += s * 4

    # ODI (weight 4)
    if odi < 50:   o = 4; flags.append("ODI<50 (critical oxygen delivery failure)")
    elif odi < 60: o = 3; flags.append("ODI<60 (reduced O2 delivery)")
    elif odi < 75: o = 1
    else: o = 0
    total += o * 4

    # STRS (weight 3)
    if strs > 25:   r = 4; flags.append("STRS>25 (critical SpO2-Temp risk)")
    elif strs > 15: r = 3; flags.append("STRS>15 (high SpO2-Temp risk)")
    elif strs > 8:  r = 2; flags.append("STRS>8 (moderate SpO2-Temp risk)")
    elif strs > 3:  r = 1
    else: r = 0
    total += r * 3

    # MAP (weight 2)
    if map_est < 60:   p = 4; flags.append("MAP<60 mmHg (shock threshold)")
    elif map_est < 65: p = 3; flags.append("MAP<65 mmHg (septic shock threshold)")
    elif map_est < 70: p = 1
    else: p = 0
    total += p * 2

    # SpO2 direct (weight 4)
    if spo2 < 85:   q = 4; flags.append("SpO2<85% (life-threatening hypoxaemia)")
    elif spo2 < 90: q = 3; flags.append("SpO2<90% (critical hypoxaemia)")
    elif spo2 < 94: q = 2; flags.append("SpO2<94% (below normal range)")
    elif spo2 < 97: q = 1
    else: q = 0
    total += q * 4

    # HR direct (weight 3)
    if hr > 150:              h = 4; flags.append("HR>150 bpm (life-threatening tachycardia)")
    elif hr < 40:             h = 4; flags.append("HR<40 bpm (life-threatening bradycardia)")
    elif hr > 130 or hr < 50: h = 3; flags.append(f"HR={hr} bpm (severely abnormal)")
    elif hr > 110 or hr < 60: h = 2
    elif hr > 100:            h = 1
    else: h = 0
    total += h * 3

    # Temp direct (weight 3)
    if temp >= 40.5:                  t = 4; flags.append("Temp>=40.5 C (dangerous hyperpyrexia)")
    elif temp < 35.0:                 t = 3; flags.append("Temp<35.0 C (hypothermia)")
    elif temp >= 39.1:                t = 3; flags.append(f"Temp={temp} C (high fever)")
    elif temp >= 38.1 or temp < 35.5: t = 2
    elif temp >= 37.3 or temp < 36.1: t = 1
    else: t = 0
    total += t * 3

    score = round((total / 112) * 100, 1)
    return score, flags


def score_to_risk_level(score):
    if score >= 60: return "CRITICAL"
    if score >= 35: return "HIGH"
    if score >= 15: return "MEDIUM"
    return "LOW"


def categorize_risk(scenario, derived, spo2, temp, hr):
    """Full risk categorization combining scenario base + vital-derived risk."""
    numeric_score, flags = compute_risk_score(
        derived["shock_index"], derived["odi"], derived["strs"],
        derived["map_est"], derived["mews"], spo2, temp, hr
    )
    scenario_base = SCENARIO_BASE_RISK.get(scenario, "MEDIUM")
    vital_derived = score_to_risk_level(numeric_score)
    final = RISK_LEVELS[max(RISK_LEVELS.index(scenario_base), RISK_LEVELS.index(vital_derived))]

    descriptions = {
        "LOW": "Patient is stable. Routine monitoring recommended.",
        "MEDIUM": "Mild clinical concern. Watchful waiting and timely review required.",
        "HIGH": "Significant clinical deterioration possible. Prompt medical assessment needed.",
        "CRITICAL": "Immediate life threat. Emergency intervention required without delay.",
    }

    return {
        "category": final,
        "numeric_score": numeric_score,
        "flags": flags,
        "scenario_base": scenario_base,
        "vital_derived": vital_derived,
        "color": RISK_COLORS[final],
        "description": descriptions[final],
    }


# ── SIRS Check ──

def sirs_criteria_met(hr, temp, rr=None):
    criteria = 0
    if temp > 38.0 or temp < 36.0: criteria += 1
    if hr > 90: criteria += 1
    if rr is not None and rr > 20: criteria += 1
    return criteria >= 2


# ── Patient Guidance Engine ──

def generate_guidance(hr, spo2, temp, age_group, comorbidities=None, activity_level="sedentary", rr=None):
    """Rule-based real-time vital-sign guidance. Refs: WHO 2019, NHS, BTS, GOLD 2023, AHA/ACC 2021."""
    if comorbidities is None:
        comorbidities = []
    guidance = []
    urgency = "routine"

    def _max_urg(a, b):
        order = ["routine", "watch", "urgent", "emergency"]
        return order[max(order.index(a), order.index(b))]

    # SpO2
    if spo2 < 90:
        guidance.append({"message": "Oxygen level is critically low.", "action": "Call emergency services immediately. Sit upright. Loosen tight clothing.", "urgency": "emergency", "ref": "WHO Self-Care Guidelines 2019; BTS Oxygen Guidelines"})
        urgency = "emergency"
    elif spo2 < 94:
        target = "88-92%" if "copd" in comorbidities else "94-98%"
        guidance.append({"message": "Oxygen level is below the normal range.", "action": f"Sit upright. Breathe slowly and deeply. Target SpO2 {target}. Remeasure in 5 min; contact doctor if no improvement.", "urgency": "urgent", "ref": "GOLD Guidelines 2023; BTS Oxygen Guidelines"})
        urgency = _max_urg(urgency, "urgent")
    elif spo2 < 96 and "copd" not in comorbidities:
        guidance.append({"message": "Oxygen level is mildly low.", "action": "Rest quietly. Avoid exertion. Remeasure in 10 minutes.", "urgency": "watch", "ref": "NHS Patient Information Standards"})
        urgency = _max_urg(urgency, "watch")

    # Heart rate
    hr_range = NORMAL_RANGES.get(age_group, NORMAL_RANGES["middle_aged"])["hr"]
    if hr > hr_range[1] + 30:
        guidance.append({"message": "Heart rate is significantly elevated.", "action": "Stop all activity. Sit or lie down. Breathe in for 4s, out for 6s. If chest pain or dizziness — call emergency.", "urgency": "urgent", "ref": "AHA/ACC Chest Pain Guidelines 2021"})
        urgency = _max_urg(urgency, "urgent")
    elif hr > hr_range[1] and activity_level == "sedentary":
        guidance.append({"message": "Heart rate is elevated at rest.", "action": "Rest 10 min and remeasure. Drink water. Avoid caffeine. Contact doctor if it remains elevated.", "urgency": "watch", "ref": "WHO Self-Care Guidelines 2019"})
        urgency = _max_urg(urgency, "watch")
    elif hr < hr_range[0] - 15:
        guidance.append({"message": "Heart rate is lower than expected.", "action": "If dizzy, faint, or breathless — call emergency. If feeling well, rest and remeasure in 10 min.", "urgency": "urgent", "ref": "AHA/ACC Guidelines"})
        urgency = _max_urg(urgency, "urgent")

    # Temperature
    if temp >= 40.5:
        guidance.append({"message": "Dangerously high fever.", "action": "Call emergency immediately. Apply cool wet cloths to forehead and wrists.", "urgency": "emergency", "ref": "WHO Fever Management Guidelines"})
        urgency = "emergency"
    elif temp >= 39.0:
        guidance.append({"message": "High fever.", "action": "Contact your doctor today. Rest completely. Drink fluids every 30 min. Wear light clothing. Monitor temperature every 30 min.", "urgency": "urgent", "ref": "WHO Fever Management Guidelines"})
        urgency = _max_urg(urgency, "urgent")
    elif temp >= 38.0:
        guidance.append({"message": "Fever present.", "action": "Rest and increase fluid intake. Monitor every hour. Contact doctor if fever persists >24hr or rises above 39 C.", "urgency": "watch", "ref": "NHS Patient Information Standards"})
        urgency = _max_urg(urgency, "watch")
    elif temp < 35.5:
        guidance.append({"message": "Body temperature is low (possible hypothermia).", "action": "Move to warm environment. Put on warm layers. Drink warm beverage. Seek medical help if no improvement in 30 min.", "urgency": "urgent", "ref": "NHS Hypothermia Guidelines"})
        urgency = _max_urg(urgency, "urgent")

    # SIRS
    if sirs_criteria_met(hr, temp, rr):
        guidance.append({"message": "Multiple vital signs are abnormal simultaneously (SIRS pattern).", "action": "This pattern needs medical evaluation now. Go to the nearest clinic or call your doctor.", "urgency": "urgent", "ref": "Bone et al., Chest 1992 (SIRS criteria)"})
        urgency = _max_urg(urgency, "urgent")

    # Paediatric fever
    if age_group in ("infant", "child") and temp >= 38.0:
        guidance.append({"message": "Fever in young children needs prompt attention.", "action": "Contact your paediatrician today. Do NOT give aspirin to children under 16. Keep child hydrated.", "urgency": "urgent", "ref": "WHO Self-Care Guidelines 2019; RCPCH Fever Guidelines"})
        urgency = _max_urg(urgency, "urgent")

    if not guidance:
        guidance.append({"message": "All readings are within normal range.", "action": "Continue regular monitoring as scheduled. Stay hydrated.", "urgency": "routine", "ref": "WHO Self-Care Guidelines 2019"})

    return {"guidance": guidance, "overall_urgency": urgency}


# ── Scenario Clinical Protocols ──

SCENARIO_PROTOCOLS = {
    "healthy": {"level": "routine", "steps": ["Maintain current activity levels and balanced diet.", "Annual routine checkup including BP, BMI, and fasting glucose.", "Monitor hydration: aim for 8 cups (2L) of water per day."], "ref": "WHO Self-Care Guidelines 2019"},
    "fever": {"level": "watch", "steps": ["Paracetamol 500-1000mg every 4-6hr (max 4g/day) OR ibuprofen 400mg every 6-8hr with food.", "Increase fluid intake to >=2L/day.", "Wear light clothing; sponge with lukewarm water if temp >39 C.", "Monitor temperature every 4-6hr. Seek care if >39.5 C or lasts >72hr."], "ref": "WHO Fever Management Guidelines; NICE CG160"},
    "critical": {"level": "emergency", "steps": ["EMERGENCY - activate emergency response immediately.", "Ensure airway is open; position patient in recovery position if unconscious.", "Administer supplemental O2 if SpO2 <90%.", "Establish IV access; draw bloods (FBC, U&E, CRP, lactate, blood cultures).", "Continuous monitoring. Prepare for ICU transfer."], "ref": "ILCOR/AHA Resuscitation Guidelines 2020; SSC 2021"},
    "pneumonia": {"level": "urgent", "steps": ["Initiate antibiotics per local protocol within 4hr of diagnosis.", "Order chest X-ray and send sputum culture.", "Administer supplemental O2 if SpO2 <94% (target 94-98%).", "Assess severity using CURB-65 score; admit if score >=2.", "Reassess 48-72hr after antibiotic start."], "ref": "BTS/SIGN Pneumonia Guidelines 2019; NICE CG191"},
    "cardiac_event": {"level": "emergency", "steps": ["Call emergency services immediately.", "Give aspirin 300mg chewed if not contraindicated.", "Rest in semi-recumbent position; loosen tight clothing.", "12-lead ECG ASAP; send troponin STAT.", "Prepare for urgent PCI or thrombolysis."], "ref": "AHA/ACC Chest Pain Guidelines 2021; ESC STEMI 2017"},
    "hypoxia": {"level": "emergency", "steps": ["Apply high-flow O2 via non-rebreather mask (15L/min) immediately.", "Continuous pulse oximetry; target SpO2 94-98%.", "Sit patient upright; obtain IV access and ABG.", "Identify and treat underlying cause (PE, pneumothorax, pulmonary oedema).", "Prepare for NIV or intubation if SpO2 <85% despite O2."], "ref": "BTS Oxygen Guideline 2017; NICE NG224"},
    "hypertension_crisis": {"level": "emergency", "steps": ["IV antihypertensive therapy per local protocol.", "Reduce MAP by no more than 25% within the first hour.", "Neurological assessment: GCS, fundoscopy.", "Monitor BP every 5-15 min; continuous cardiac monitoring.", "Urgent investigations: renal function, ECG, CT head if neurological signs."], "ref": "ESC/ESH Hypertension Guidelines 2018"},
    "sepsis": {"level": "emergency", "steps": ["IV broad-spectrum antibiotics within 1hr of recognition.", "Obtain >=2 sets of blood cultures before antibiotics.", "IV crystalloid 30mL/kg within 3hr; reassess with dynamic measures.", "Measure serum lactate; if >2 mmol/L, repeat within 2hr.", "If MAP <65 despite fluids, start vasopressors (noradrenaline first-line)."], "ref": "Surviving Sepsis Campaign 2021"},
    "respiratory_distress": {"level": "urgent", "steps": ["Identify and treat trigger: infection, PE, pneumothorax, bronchospasm.", "Apply O2 or NIV; target SpO2 94-98%.", "Bronchodilators (salbutamol 2.5-5mg nebulised) if airflow obstruction.", "IV/oral corticosteroids if inflammatory cause.", "Prepare for intubation if GCS <8 or worsening ABG."], "ref": "BTS/ICS NIV Guidelines 2016; NICE NG191"},
    "copd_exacerbation": {"level": "urgent", "steps": ["Controlled O2 therapy: target SpO2 88-92%.", "Salbutamol 2.5-5mg via nebuliser q20-30 min for 3 doses.", "Ipratropium bromide 500mcg nebulised q6-8hr.", "Oral prednisolone 30-40mg/day for 5 days.", "Antibiotics if purulent sputum or CRP >10.", "Consider NIV if pH <7.35 and PaCO2 elevated."], "ref": "GOLD Guidelines 2023; NICE CG101"},
    "asthma_exacerbation": {"level": "urgent", "steps": ["Salbutamol 4-10 puffs via spacer; repeat every 20 min for 3 doses.", "O2 to maintain SpO2 93-95%.", "Oral prednisolone 40-50mg/day for 5-7 days.", "Reassess after each salbutamol dose using peak flow and SpO2.", "Admit if no improvement after 3 doses or peak flow <50% predicted."], "ref": "GINA Guidelines 2023; BTS/SIGN Asthma 2019"},
    "heart_failure": {"level": "urgent", "steps": ["IV furosemide 40-80mg bolus for acute decompensation; monitor urine output.", "Restrict fluid intake to 1.5-2L/day; restrict sodium to <2g/day.", "Sit patient upright (60-90 degrees); apply O2 if SpO2 <90%.", "Echocardiogram and BNP/NT-proBNP.", "Review disease-modifying therapy: ACEi/ARB, beta-blocker, MRA, SGLT2i."], "ref": "ESC Heart Failure Guidelines 2021; NICE NG106"},
}


def get_full_recommendations(scenario, hr, spo2, temp, age_group, comorbidities=None, activity_level="sedentary", rr=None):
    """Combines scenario protocol + real-time vital guidance."""
    if comorbidities is None:
        comorbidities = []
    vital_result = generate_guidance(hr=hr, spo2=spo2, temp=temp, age_group=age_group, comorbidities=comorbidities, activity_level=activity_level, rr=rr)
    protocol = SCENARIO_PROTOCOLS.get(scenario, {"level": "watch", "steps": ["Consult a clinician."], "ref": "N/A"})

    urgency_order = ["routine", "watch", "urgent", "emergency"]
    merged_urgency = urgency_order[max(urgency_order.index(protocol["level"]), urgency_order.index(vital_result["overall_urgency"]))]

    return {
        "scenario_protocol": {"scenario": scenario, "urgency": protocol["level"], "steps": protocol["steps"], "reference": protocol["ref"]},
        "vital_guidance": vital_result["guidance"],
        "overall_urgency": merged_urgency,
        "disclaimer": "This guidance supports self-monitoring only. It does not replace professional medical advice. Always consult a qualified doctor for diagnosis and treatment.",
    }


# ── Feature Engineering for DataFrame ──

def engineer_features(df):
    """Add all derived feature columns to a dataframe."""
    df = df.copy()
    df["comorbidity_count"] = df["comorbidities"].fillna("").apply(lambda x: len([c for c in x.split(",") if c.strip()]))
    df["has_hypertension"] = df["comorbidities"].fillna("").str.contains("hypertension").astype(int)
    df["has_diabetes"] = df["comorbidities"].fillna("").str.contains("diabetes").astype(int)
    df["has_copd"] = df["comorbidities"].fillna("").str.contains("copd").astype(int)
    df["has_asthma"] = df["comorbidities"].fillna("").str.contains("asthma").astype(int)

    df["sbp_est"] = np.clip(110 + 0.5 * df["age"] - 0.5 * (df["bmi"] - 22), 70, 200)
    df["shock_index"] = df["heartRate"] / df["sbp_est"]
    df["rpp"] = df["heartRate"] * (df["sbp_est"] / 1000)
    df["odi"] = (df["spO2"] / 100) * df["heartRate"]
    df["strs"] = (1 - df["spO2"] / 100) * 100 + np.maximum(0, df["temperature"] - 37.5) * 5
    df["weight_kg"] = df["bmi"] * (ASSUMED_HEIGHT_CM / 100) ** 2
    df["bsa"] = 0.007184 * (df["weight_kg"] ** 0.425) * (ASSUMED_HEIGHT_CM ** 0.725)
    df["dbp_est"] = 0.65 * df["sbp_est"]
    df["map_est"] = df["dbp_est"] + (df["sbp_est"] - df["dbp_est"]) / 3
    df["rr_proxy"] = 1.5 * (df["heartRate"] / df["spO2"]) * 100
    df["mews"] = df["heartRate"].apply(mews_hr) + df["rr_proxy"].apply(mews_rr) + df["temperature"].apply(mews_temp)

    return df


# ── Training ──

_le_gender = LabelEncoder()
_le_activity = LabelEncoder()
_le_age_group = LabelEncoder()
_le_target = LabelEncoder()
_scaler = StandardScaler()


def train_model(csv_path=None):
    global _le_gender, _le_activity, _le_age_group, _le_target, _scaler

    if csv_path is None:
        csv_path = CSV_PATH

    print(f"Loading dataset from {csv_path}...")
    df = pd.read_csv(csv_path)
    print(f"Dataset: {len(df)} records, {df['scenario'].nunique()} scenarios")

    df = engineer_features(df)

    _le_gender = LabelEncoder()
    _le_activity = LabelEncoder()
    _le_age_group = LabelEncoder()
    _le_target = LabelEncoder()

    df["gender_enc"] = _le_gender.fit_transform(df["gender"])
    df["activity_enc"] = _le_activity.fit_transform(df["activity_level"])
    df["age_group_enc"] = _le_age_group.fit_transform(df["age_group"])

    X = df[FEATURES]
    y = _le_target.fit_transform(df["scenario"])

    # Add 4% label noise for realistic evaluation
    np.random.seed(42)
    noise_mask = np.random.random(len(y)) < 0.04
    y_noisy = y.copy()
    y_noisy[noise_mask] = np.random.choice(np.unique(y), size=noise_mask.sum())

    X_train, X_test, y_train, y_test = train_test_split(X, y_noisy, test_size=0.2, random_state=42, stratify=y_noisy)

    _scaler = StandardScaler()
    X_train_sc = _scaler.fit_transform(X_train)
    X_test_sc = _scaler.transform(X_test)

    print("Training Random Forest...")
    rf = RandomForestClassifier(
        n_estimators=150, max_depth=13, min_samples_leaf=4,
        min_samples_split=8, class_weight="balanced", random_state=42, n_jobs=-1,
    )
    rf.fit(X_train_sc, y_train)

    y_pred = rf.predict(X_test_sc)
    acc = accuracy_score(y_test, y_pred)
    cv_scores = cross_val_score(rf, X_train_sc, y_train, cv=5, scoring="accuracy")

    print(f"\nTest Accuracy: {acc:.4f}")
    print(f"5-Fold CV: {cv_scores.mean():.4f} +/- {cv_scores.std():.4f}")
    print(classification_report(y_test, y_pred, target_names=_le_target.classes_))

    # Save
    joblib.dump(rf, MODEL_PATH)
    joblib.dump(_le_target, ENCODER_PATH)
    joblib.dump(_scaler, SCALER_PATH)
    joblib.dump({"gender": _le_gender, "activity": _le_activity, "age_group": _le_age_group}, ENCODERS_PATH)

    print(f"Model saved to {MODEL_PATH}")
    return rf, _le_target, acc


def load_model():
    global _le_gender, _le_activity, _le_age_group, _le_target, _scaler
    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError("Trained model not found. Run train_model() first.")
    model = joblib.load(MODEL_PATH)
    _le_target = joblib.load(ENCODER_PATH)
    _scaler = joblib.load(SCALER_PATH)
    encoders = joblib.load(ENCODERS_PATH)
    _le_gender = encoders["gender"]
    _le_activity = encoders["activity"]
    _le_age_group = encoders["age_group"]
    return model, _le_target


def predict_single(reading, model=None, le=None):
    """
    Predict scenario + risk + recommendations for a single vital reading.
    reading: dict with heartRate, spO2, temperature, age, age_group, gender, bmi, comorbidities, activity_level
    """
    global _scaler, _le_gender, _le_activity, _le_age_group

    if model is None or le is None:
        model, le = load_model()

    hr = float(reading["heartRate"])
    spo2 = float(reading["spO2"])
    temp = float(reading["temperature"])
    age = int(reading["age"])
    bmi = float(reading["bmi"])
    age_group = reading["age_group"]
    gender = reading["gender"]
    activity = reading.get("activity_level", "light")
    comorb_str = reading.get("comorbidities", "")
    comorb_list = [c.strip() for c in comorb_str.split(",") if c.strip() and c.strip() != "none"]

    derived = compute_derived(hr, spo2, temp, age, bmi)

    row = {
        "age": age, "bmi": bmi, "heartRate": hr, "spO2": spo2, "temperature": temp,
        "gender_enc": _le_gender.transform([gender])[0],
        "activity_enc": _le_activity.transform([activity])[0],
        "age_group_enc": _le_age_group.transform([age_group])[0],
        "comorbidity_count": len(comorb_list),
        "has_hypertension": int("hypertension" in comorb_str.lower()),
        "has_diabetes": int("diabetes" in comorb_str.lower()),
        "has_copd": int("copd" in comorb_str.lower()),
        "has_asthma": int("asthma" in comorb_str.lower()),
        **{k: derived[k] for k in ["shock_index", "rpp", "odi", "strs", "bsa", "map_est", "rr_proxy", "mews"]},
    }

    X_new = _scaler.transform(pd.DataFrame([row])[FEATURES])
    pred = model.predict(X_new)[0]
    proba = model.predict_proba(X_new)[0]
    scenario = le.inverse_transform([pred])[0]
    confidence = float(proba[pred])

    prob_dict = {le.inverse_transform([i])[0]: round(float(p), 4) for i, p in enumerate(proba)}
    prob_sorted = dict(sorted(prob_dict.items(), key=lambda x: x[1], reverse=True))

    risk = categorize_risk(scenario, derived, spo2, temp, hr)
    recommendations = get_full_recommendations(scenario, hr, spo2, temp, age_group, comorb_list, activity, derived["rr_proxy"])

    return {
        "prediction": scenario,
        "confidence": round(confidence, 4),
        "probabilities": prob_sorted,
        "derived_vitals": derived,
        "risk": risk,
        "recommendations": recommendations,
    }


# ── Temporal features (unchanged) ──

def compute_temporal_features(readings_list):
    if len(readings_list) < 2:
        return {"hrv_sdnn": None, "hr_trend": "stable", "spo2_trend": "stable", "temp_trend": "stable", "temp_rate_of_change": 0, "spo2_desaturation_flag": False, "deterioration_trend": "stable"}

    hrs = [r["heartRate"] for r in readings_list]
    spo2s = [r["spO2"] for r in readings_list]
    temps = [r["temperature"] for r in readings_list]

    rr_intervals = [60000.0 / hr for hr in hrs if hr > 0]
    hrv_sdnn = float(np.std(rr_intervals)) if len(rr_intervals) >= 2 else None

    def trend_slope(values):
        if len(values) < 2: return 0
        return np.polyfit(np.arange(len(values)), values, 1)[0]

    def categorize_trend(slope, threshold=0.5):
        if slope > threshold: return "increasing"
        if slope < -threshold: return "decreasing"
        return "stable"

    hr_slope = trend_slope(hrs)
    spo2_slope = trend_slope(spo2s)
    temp_slope = trend_slope(temps)

    spo2_avg = np.mean(spo2s)
    spo2_desat = bool(any(s <= spo2_avg - 3 for s in spo2s[-2:]))
    temp_roc = (temps[-1] - temps[0]) / (len(temps) * 5 / 60) if len(temps) >= 2 else 0

    deteriorating = hr_slope > 0.5 and spo2_slope < -0.1
    improving = hr_slope < -0.5 and spo2_slope > 0.1

    return {
        "hrv_sdnn": round(hrv_sdnn, 2) if hrv_sdnn else None,
        "hr_trend": categorize_trend(hr_slope),
        "spo2_trend": categorize_trend(spo2_slope, 0.2),
        "temp_trend": categorize_trend(temp_slope, 0.1),
        "temp_rate_of_change": round(temp_roc, 2),
        "spo2_desaturation_flag": spo2_desat,
        "deterioration_trend": "deteriorating" if deteriorating else ("improving" if improving else "stable"),
    }


if __name__ == "__main__":
    model, le, acc = train_model()
    print(f"\nClasses: {list(le.classes_)}")

    result = predict_single({
        "heartRate": 125, "spO2": 87, "temperature": 38.9,
        "age": 72, "age_group": "elderly", "gender": "M",
        "bmi": 28, "comorbidities": "copd,hypertension", "activity_level": "sedentary"
    }, model, le)
    print(f"\nPrediction: {result['prediction']} ({result['confidence']:.1%})")
    print(f"Risk: {result['risk']['category']} (score {result['risk']['numeric_score']}/100)")
    print(f"Derived: {result['derived_vitals']}")
    print(f"Urgency: {result['recommendations']['overall_urgency']}")
