/**
 * Prediction gating — applies clinical UX filters to raw ML predictions.
 *
 * Strategies implemented:
 *  1. Grace period: first 3 readings show "analyzing"
 *  2. Persistence check: CRITICAL only confirmed after 3 consecutive CRITICAL predictions
 *  3. Signal quality check: rejects display if recent readings are too erratic
 *  4. Confidence filter: low-confidence predictions show "uncertain"
 *  5. Outlier detection: flags readings that don't fit recent pattern
 *  6. Role-based softening: patients see gentle language, doctors see raw data
 */

const GRACE_PERIOD_READINGS = 3
const PERSISTENCE_THRESHOLD = 3
const CONFIDENCE_THRESHOLD = 0.55
const SIGNAL_QUALITY_WINDOW = 5

// Signal quality thresholds (std deviation)
const HR_STD_GOOD = 8
const HR_STD_POOR = 15
const SPO2_STD_GOOD = 1.5
const SPO2_STD_POOR = 3
const TEMP_STD_GOOD = 0.2
const TEMP_STD_POOR = 0.5


function stdDev(values) {
  if (values.length < 2) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}


export function computeSignalQuality(recentReadings) {
  if (recentReadings.length < 3) {
    return { quality: 'unknown', reason: 'Not enough readings', color: 'gray' }
  }

  const recent = recentReadings.slice(-SIGNAL_QUALITY_WINDOW)
  const hrs = recent.map(r => r.hr ?? r.heartRate).filter(v => v != null)
  const spo2s = recent.map(r => r.spo2 ?? r.spO2).filter(v => v != null)
  const temps = recent.map(r => r.temp ?? r.temperature).filter(v => v != null)

  const hrStd = stdDev(hrs)
  const spo2Std = stdDev(spo2s)
  const tempStd = stdDev(temps)

  if (hrStd > HR_STD_POOR || spo2Std > SPO2_STD_POOR || tempStd > TEMP_STD_POOR) {
    return {
      quality: 'poor',
      reason: `Readings are unstable (HR ±${hrStd.toFixed(1)}, SpO2 ±${spo2Std.toFixed(1)}%). Please hold sensor steady.`,
      color: 'red',
    }
  }
  if (hrStd > HR_STD_GOOD || spo2Std > SPO2_STD_GOOD || tempStd > TEMP_STD_GOOD) {
    return {
      quality: 'fair',
      reason: 'Some variance in readings. Try to keep still.',
      color: 'amber',
    }
  }
  return {
    quality: 'good',
    reason: 'Signal is stable.',
    color: 'green',
  }
}


export function isOutlier(newReading, recentReadings) {
  if (recentReadings.length < 3) return false

  const recent = recentReadings.slice(-5)
  const meanHR = recent.reduce((s, r) => s + (r.hr ?? r.heartRate), 0) / recent.length
  const meanSpO2 = recent.reduce((s, r) => s + (r.spo2 ?? r.spO2), 0) / recent.length

  const hr = newReading.hr ?? newReading.heartRate
  const spo2 = newReading.spo2 ?? newReading.spO2

  // > 25% deviation from recent mean is an outlier
  if (Math.abs(hr - meanHR) / meanHR > 0.25) return true
  if (Math.abs(spo2 - meanSpO2) > 5) return true
  return false
}


/**
 * Main gating function. Takes the raw prediction + history and returns display data.
 *
 * @param {object} prediction - the raw ML prediction object
 * @param {array} history - array of past readings with { prediction, hr, spo2, temp }
 * @param {string} role - 'doctor' or 'patient'
 * @returns display decision object
 */
export function gatePrediction(prediction, history = [], role = 'doctor') {
  // 1. Grace period
  if (history.length < GRACE_PERIOD_READINGS) {
    return {
      status: 'analyzing',
      label: 'Analyzing...',
      message: 'Collecting initial readings. Please hold the sensor steady.',
      color: 'blue',
      showDetails: false,
      rawPrediction: prediction,
    }
  }

  // 2. Signal quality
  const signalQuality = computeSignalQuality(history)
  if (signalQuality.quality === 'poor') {
    return {
      status: 'uncertain',
      label: role === 'patient' ? 'Retake Reading' : 'Poor Signal',
      message: signalQuality.reason,
      color: 'amber',
      signalQuality,
      showDetails: false,
      rawPrediction: prediction,
    }
  }

  // 3. Confidence threshold
  if (prediction.confidence < CONFIDENCE_THRESHOLD) {
    return {
      status: 'uncertain',
      label: role === 'patient' ? 'Inconclusive' : 'Low Confidence',
      message: role === 'patient'
        ? 'Readings are unclear. Please retake the measurement.'
        : `Low confidence (${(prediction.confidence * 100).toFixed(0)}%) — prediction may be unreliable.`,
      color: 'amber',
      signalQuality,
      showDetails: role === 'doctor',
      rawPrediction: prediction,
    }
  }

  // 4. Outlier check
  if (history.length >= 3 && isOutlier(history[history.length - 1], history.slice(0, -1))) {
    return {
      status: 'uncertain',
      label: role === 'patient' ? 'Anomaly Detected' : 'Outlier Reading',
      message: role === 'patient'
        ? 'This reading differs from your recent pattern. Please retake to confirm.'
        : 'Current reading is a statistical outlier compared to recent trend.',
      color: 'amber',
      signalQuality,
      showDetails: role === 'doctor',
      rawPrediction: prediction,
    }
  }

  // 5. Persistence check for CRITICAL
  const currentRisk = prediction.risk?.category
  if (currentRisk === 'CRITICAL') {
    // Look at the last 3 predictions
    const recentRisks = history.slice(-PERSISTENCE_THRESHOLD).map(h => h.riskCategory || h.risk?.category)
    const criticalCount = recentRisks.filter(r => r === 'CRITICAL').length

    if (criticalCount < PERSISTENCE_THRESHOLD - 1) {
      // Not confirmed yet — softer label
      return {
        status: 'warning',
        label: role === 'patient' ? 'Please Consult Doctor' : 'Potential Critical',
        message: role === 'patient'
          ? 'Your readings suggest you should consult a doctor. Please retake the measurement or seek medical advice.'
          : `Single-point CRITICAL prediction (${(prediction.confidence * 100).toFixed(0)}%). Awaiting persistence confirmation.`,
        color: 'orange',
        signalQuality,
        unconfirmed: true,
        showDetails: role === 'doctor',
        rawPrediction: prediction,
      }
    }
    // 3+ consecutive CRITICAL — confirmed
    return {
      status: 'critical',
      label: role === 'patient' ? 'Seek Medical Attention' : 'CRITICAL (Confirmed)',
      message: role === 'patient'
        ? 'Your readings have shown a concerning pattern across multiple measurements. Please contact your doctor or emergency services.'
        : `CRITICAL risk confirmed across ${criticalCount} consecutive readings.`,
      color: 'red',
      signalQuality,
      showDetails: true,
      rawPrediction: prediction,
    }
  }

  // 6. HIGH risk
  if (currentRisk === 'HIGH') {
    return {
      status: 'warning',
      label: role === 'patient' ? 'Please Take Care' : 'High Risk',
      message: role === 'patient'
        ? 'Your readings show some concerning signs. Consider consulting a doctor.'
        : `High risk (${prediction.risk.numeric_score}/100). Clinical review recommended.`,
      color: 'orange',
      signalQuality,
      showDetails: role === 'doctor',
      rawPrediction: prediction,
    }
  }

  // 7. MEDIUM
  if (currentRisk === 'MEDIUM') {
    return {
      status: 'caution',
      label: role === 'patient' ? 'Monitor Yourself' : 'Medium Risk',
      message: role === 'patient'
        ? 'Your readings are slightly outside normal range. Keep monitoring and consult a doctor if symptoms persist.'
        : `Medium risk (${prediction.risk.numeric_score}/100). Increased monitoring advised.`,
      color: 'amber',
      signalQuality,
      showDetails: role === 'doctor',
      rawPrediction: prediction,
    }
  }

  // 8. LOW — all good
  return {
    status: 'stable',
    label: role === 'patient' ? 'Normal' : 'Stable — Low Risk',
    message: role === 'patient'
      ? 'Your readings are within normal range.'
      : `Low risk (${prediction.risk?.numeric_score || 0}/100). Continue routine monitoring.`,
    color: 'green',
    signalQuality,
    showDetails: role === 'doctor',
    rawPrediction: prediction,
  }
}
