"""
report_generator.py - Professional health report generation
Generates structured clinical reports from patient vitals, ML predictions, and trend analysis.
"""

from datetime import datetime


SCENARIO_DESCRIPTIONS = {
    "healthy": {
        "title": "Normal / Healthy",
        "description": "All vital parameters are within age-adjusted normal ranges.",
        "severity": "none",
        "color": "#22c55e",
    },
    "fever": {
        "title": "Fever",
        "description": "Elevated body temperature detected with proportional heart rate response.",
        "severity": "moderate",
        "color": "#f59e0b",
    },
    "critical": {
        "title": "Critical Condition",
        "description": "Multiple vital parameters indicate critical physiological compromise requiring immediate intervention.",
        "severity": "critical",
        "color": "#ef4444",
    },
    "pneumonia": {
        "title": "Pneumonia Pattern",
        "description": "Vital sign pattern consistent with pneumonia: sustained SpO2 reduction with fever and tachycardia.",
        "severity": "high",
        "color": "#f97316",
    },
    "respiratory_distress": {
        "title": "Respiratory Distress",
        "description": "Signs of respiratory compromise with compensatory tachycardia and oxygen desaturation.",
        "severity": "high",
        "color": "#f97316",
    },
    "asthma_exacerbation": {
        "title": "Asthma Exacerbation",
        "description": "Pattern consistent with acute asthma exacerbation: rapid SpO2 deterioration with heart rate spike.",
        "severity": "high",
        "color": "#f97316",
    },
    "cardiac_event": {
        "title": "Cardiac Event (ACS Pattern)",
        "description": "Heart rate abnormalities suggestive of acute coronary syndrome. ECG and further cardiac workup recommended.",
        "severity": "critical",
        "color": "#ef4444",
    },
    "hypoxia": {
        "title": "Hypoxia",
        "description": "Significant oxygen desaturation below age-adjusted threshold with compensatory tachycardia.",
        "severity": "high",
        "color": "#f97316",
    },
    "hypertension_crisis": {
        "title": "Hypertension Crisis Pattern",
        "description": "Tachycardia pattern consistent with hypertensive urgency. Blood pressure measurement recommended for confirmation.",
        "severity": "high",
        "color": "#f97316",
    },
    "heart_failure": {
        "title": "Heart Failure Pattern",
        "description": "Persistent low-grade oxygen desaturation with resting tachycardia suggestive of heart failure exacerbation.",
        "severity": "high",
        "color": "#f97316",
    },
    "sepsis": {
        "title": "Sepsis / SIRS",
        "description": "Heart rate and temperature both elevated meeting SIRS criteria. Sepsis screening recommended.",
        "severity": "critical",
        "color": "#ef4444",
    },
    "copd_exacerbation": {
        "title": "COPD Exacerbation",
        "description": "SpO2 deterioration from expected COPD baseline with elevated heart rate indicating acute exacerbation.",
        "severity": "high",
        "color": "#f97316",
    },
}

NEWS2_RISK_DETAILS = {
    "low": {
        "level": 0,
        "label": "Low Risk",
        "description": "Routine monitoring adequate. No immediate clinical concern.",
        "color": "#22c55e",
    },
    "low-medium": {
        "level": 1,
        "label": "Low-Medium Risk",
        "description": "Increased monitoring recommended. Clinical assessment advised.",
        "color": "#eab308",
    },
    "medium": {
        "level": 2,
        "label": "Medium Risk",
        "description": "Urgent review by clinician required within 30 minutes.",
        "color": "#f97316",
    },
    "high": {
        "level": 3,
        "label": "High Risk",
        "description": "Immediate emergency assessment required. Consider ICU admission.",
        "color": "#ef4444",
    },
}


def generate_report(patient_info, vitals_history, prediction_result, assessment, trend_data=None):
    """
    Generate a comprehensive professional health report.

    Args:
        patient_info: dict with patient_id, name, age, age_group, gender, bmi, comorbidities
        vitals_history: list of vitals readings (dicts with timestamp, heartRate, spO2, temperature)
        prediction_result: dict from MODEL3.predict_single
        assessment: dict from health_engine.assess_vitals
        trend_data: optional dict from health_engine.assess_trends

    Returns: structured report dict
    """
    scenario = prediction_result["prediction"]
    scenario_info = SCENARIO_DESCRIPTIONS.get(scenario, SCENARIO_DESCRIPTIONS["healthy"])
    news2 = assessment["news2"]
    news2_risk_info = NEWS2_RISK_DETAILS.get(news2["risk_level"], NEWS2_RISK_DETAILS["low"])
    derived = prediction_result["derived_parameters"]

    # Latest vitals
    latest = vitals_history[-1] if vitals_history else {}

    # Build recommendations based on assessment
    recommendations = _build_recommendations(scenario, assessment, derived, patient_info)

    # Build vital signs summary
    vitals_summary = {
        "heart_rate": {
            "value": latest.get("heartRate"),
            "unit": "BPM",
            "status": assessment["heart_rate"]["status"],
            "normal_range": assessment["heart_rate"]["normal_range"],
        },
        "spo2": {
            "value": latest.get("spO2"),
            "unit": "%",
            "status": assessment["spo2"]["status"],
            "normal_range": assessment["spo2"]["normal_range"],
        },
        "temperature": {
            "value": latest.get("temperature"),
            "unit": "°C",
            "status": assessment["temperature"]["status"],
            "normal_range": assessment["temperature"]["normal_range"],
        },
    }

    # Compile all alerts
    all_alerts = list(assessment.get("alerts", []))
    if trend_data:
        all_alerts.extend(trend_data.get("trend_alerts", []))

    # Sort alerts by severity
    severity_order = {"critical": 0, "warning": 1, "info": 2}
    all_alerts.sort(key=lambda a: severity_order.get(a["level"], 3))

    report = {
        "report_id": f"RPT-{datetime.now().strftime('%Y%m%d%H%M%S')}",
        "generated_at": datetime.now().isoformat(),
        "patient": {
            "id": patient_info.get("patient_id", "Unknown"),
            "name": patient_info.get("name", "Unknown"),
            "age": patient_info.get("age"),
            "age_group": patient_info.get("age_group"),
            "gender": patient_info.get("gender"),
            "bmi": patient_info.get("bmi"),
            "bmi_category": _bmi_label(patient_info.get("bmi", 22)),
            "comorbidities": patient_info.get("comorbidities", ""),
        },
        "clinical_assessment": {
            "primary_diagnosis": {
                "scenario": scenario,
                "title": scenario_info["title"],
                "description": scenario_info["description"],
                "severity": scenario_info["severity"],
                "color": scenario_info["color"],
                "confidence": prediction_result["confidence"],
            },
            "differential": _build_differential(prediction_result["probabilities"]),
        },
        "vitals_summary": vitals_summary,
        "scoring": {
            "news2": {
                **news2,
                "risk_label": news2_risk_info["label"],
                "risk_description": news2_risk_info["description"],
                "risk_color": news2_risk_info["color"],
            },
            "sirs_flag": assessment["sirs_flag"],
            "metabolic_stress": assessment["metabolic_stress"],
            "o2_temp_composite": assessment["o2_temp_composite"],
        },
        "trends": trend_data.get("temporal_features") if trend_data else None,
        "alerts": all_alerts,
        "recommendations": recommendations,
        "readings_count": len(vitals_history),
        "monitoring_period": _compute_monitoring_period(vitals_history),
        "disclaimer": (
            "This report is generated by an AI-based clinical decision support system using "
            "MAX30102 (HR/SpO2) and LM35 (Temperature) sensor data. It is intended to assist "
            "healthcare professionals and should NOT replace clinical judgment. All critical findings "
            "must be confirmed through standard clinical assessment and appropriate diagnostic tests. "
            "Partial NEWS2 score (max 8) is used as respiratory rate sensor is unavailable."
        ),
    }

    return report


def _build_differential(probabilities):
    """Build top 3 differential diagnosis from probability dict."""
    items = list(probabilities.items())[:5]
    differential = []
    for scenario, prob in items:
        info = SCENARIO_DESCRIPTIONS.get(scenario, {})
        if prob >= 0.01:
            differential.append({
                "scenario": scenario,
                "title": info.get("title", scenario),
                "probability": prob,
                "severity": info.get("severity", "unknown"),
            })
    return differential


def _build_recommendations(scenario, assessment, derived, patient_info):
    """Generate clinical recommendations based on assessment."""
    recs = []
    news2 = assessment["news2"]

    # NEWS2 based recommendations
    if news2["total_score"] >= 7:
        recs.append({
            "priority": "urgent",
            "category": "monitoring",
            "text": "Initiate continuous vital sign monitoring. Immediate physician assessment required.",
        })
    elif news2["total_score"] >= 5:
        recs.append({
            "priority": "high",
            "category": "monitoring",
            "text": "Increase monitoring to hourly. Urgent clinical review within 30 minutes.",
        })
    elif news2["total_score"] >= 1:
        recs.append({
            "priority": "moderate",
            "category": "monitoring",
            "text": "Monitor vitals every 4-6 hours. Clinical assessment by competent decision-maker.",
        })

    # Scenario-specific recommendations
    if scenario == "sepsis":
        recs.append({
            "priority": "urgent",
            "category": "investigation",
            "text": "SIRS criteria met. Recommend blood cultures, CBC, lactate, and procalcitonin.",
        })
        recs.append({
            "priority": "urgent",
            "category": "treatment",
            "text": "Consider empiric broad-spectrum antibiotics within 1 hour if sepsis confirmed.",
        })
    elif scenario == "pneumonia":
        recs.append({
            "priority": "high",
            "category": "investigation",
            "text": "Recommend chest X-ray, CBC, CRP/ESR, and sputum culture.",
        })
        recs.append({
            "priority": "high",
            "category": "treatment",
            "text": "Assess CURB-65 score for severity. Consider antibiotic therapy per BTS guidelines.",
        })
    elif scenario == "cardiac_event":
        recs.append({
            "priority": "urgent",
            "category": "investigation",
            "text": "Immediate 12-lead ECG and troponin levels required.",
        })
        recs.append({
            "priority": "urgent",
            "category": "treatment",
            "text": "Activate cardiac emergency protocol. Consider aspirin 300mg if ACS suspected.",
        })
    elif scenario == "respiratory_distress":
        recs.append({
            "priority": "urgent",
            "category": "treatment",
            "text": "Administer supplemental oxygen to maintain SpO2 target. Assess airway patency.",
        })
    elif scenario == "asthma_exacerbation":
        recs.append({
            "priority": "high",
            "category": "treatment",
            "text": "Administer inhaled SABA (salbutamol). Assess peak flow. Consider oral corticosteroids.",
        })
    elif scenario == "copd_exacerbation":
        recs.append({
            "priority": "high",
            "category": "treatment",
            "text": "Controlled oxygen therapy targeting SpO2 88-92%. Nebulized bronchodilators.",
        })
    elif scenario == "hypoxia":
        recs.append({
            "priority": "urgent",
            "category": "treatment",
            "text": "Identify and treat cause of hypoxia. Supplemental oxygen to restore age-appropriate SpO2.",
        })
    elif scenario == "heart_failure":
        recs.append({
            "priority": "high",
            "category": "investigation",
            "text": "Assess for acute decompensation: BNP/NT-proBNP, chest X-ray, echocardiogram.",
        })
    elif scenario == "hypertension_crisis":
        recs.append({
            "priority": "high",
            "category": "investigation",
            "text": "Urgent blood pressure measurement required. This device does not measure BP directly.",
        })
    elif scenario == "fever":
        recs.append({
            "priority": "moderate",
            "category": "investigation",
            "text": "Investigate fever source: blood cultures if >38.3°C, urinalysis, chest X-ray if indicated.",
        })
        recs.append({
            "priority": "moderate",
            "category": "treatment",
            "text": "Consider antipyretics (paracetamol). Ensure adequate hydration.",
        })

    # Hypoxia-specific
    if derived.get("critical_spo2_flag"):
        recs.append({
            "priority": "urgent",
            "category": "treatment",
            "text": f"Critical oxygen desaturation. Immediate high-flow oxygen therapy required.",
        })

    # SIRS alert
    if assessment["sirs_flag"] and scenario != "sepsis":
        recs.append({
            "priority": "high",
            "category": "investigation",
            "text": "SIRS criteria met independent of primary diagnosis. Rule out concurrent infection.",
        })

    # General
    if not recs:
        recs.append({
            "priority": "low",
            "category": "monitoring",
            "text": "Vital signs within normal limits. Continue routine monitoring schedule.",
        })

    return recs


def _bmi_label(bmi):
    """Return BMI category label (Indian cutoffs)."""
    if bmi < 18.5:
        return "Underweight"
    if bmi < 23.0:
        return "Normal"
    if bmi < 27.5:
        return "Overweight"
    return "Obese"


def _compute_monitoring_period(vitals_history):
    """Compute monitoring period from first to last reading."""
    if len(vitals_history) < 2:
        return None
    try:
        first = vitals_history[0].get("timestamp", "")
        last = vitals_history[-1].get("timestamp", "")
        if first and last:
            from datetime import datetime as dt
            t1 = dt.fromisoformat(first)
            t2 = dt.fromisoformat(last)
            delta = t2 - t1
            total_minutes = int(delta.total_seconds() / 60)
            if total_minutes < 60:
                return f"{total_minutes} minutes"
            hours = total_minutes // 60
            mins = total_minutes % 60
            return f"{hours}h {mins}m"
    except Exception:
        pass
    return None
