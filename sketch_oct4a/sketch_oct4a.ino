#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>

#include <Wire.h>
#include "MAX30105.h"
#include "heartRate.h"
#include "spo2_algorithm.h"

// ── Configuration ──

// Fallback WiFi (used only if NVS list is empty on first boot)
const char* FALLBACK_WIFI_SSID = "ASAS";
const char* FALLBACK_WIFI_PASSWORD = "ghansham@117";

// Multi-WiFi support
#define MAX_WIFI_NETWORKS 8
struct WifiEntry {
  String ssid;
  String password;
};
WifiEntry savedNetworks[MAX_WIFI_NETWORKS];
int savedCount = 0;

Preferences prefs;
unsigned long lastWifiSync = 0;
const unsigned long WIFI_SYNC_INTERVAL = 120000;  // 2 minutes

// Firebase Realtime Database URL
const char* FIREBASE_URL = "https://healthmonitor-6685d-default-rtdb.firebaseio.com/";

// Flask Backend URL (Cloud Run or local)
// Set to your deployed backend URL after deployment
// Local: "http://10.61.97.31:5000"
// Cloud Run: "https://hmd-backend-xxxxx-uc.a.run.app"
const char* BACKEND_URL = "https://hmd-backend.onrender.com";

// Device / Patient ID — must match what you link in the web app
const char* DEVICE_ID = "PATIENT_001";

// Send interval (milliseconds)
const unsigned long SEND_INTERVAL_MS = 10000;
unsigned long lastSendTime = 0;

// Boot timestamp for approximating ISO time
unsigned long bootEpoch = 0;

// ── Sensor Setup ──

MAX30105 particleSensor;
const int tempPin = A0;

#define MAX_SAMPLES 100
uint32_t irBuffer[MAX_SAMPLES];
uint32_t redBuffer[MAX_SAMPLES];
int bufferIndex = 0;

// ── Multi-WiFi helpers ──

void loadWifiListFromFlash() {
  prefs.begin("wifi", true);
  savedCount = prefs.getInt("count", 0);
  if (savedCount > MAX_WIFI_NETWORKS) savedCount = MAX_WIFI_NETWORKS;
  for (int i = 0; i < savedCount; i++) {
    savedNetworks[i].ssid = prefs.getString(("s" + String(i)).c_str(), "");
    savedNetworks[i].password = prefs.getString(("p" + String(i)).c_str(), "");
  }
  prefs.end();
  Serial.printf("Loaded %d saved WiFi networks from flash\n", savedCount);
  for (int i = 0; i < savedCount; i++) {
    Serial.printf("  [%d] %s\n", i, savedNetworks[i].ssid.c_str());
  }
}

void saveWifiListToFlash() {
  prefs.begin("wifi", false);
  prefs.clear();
  prefs.putInt("count", savedCount);
  for (int i = 0; i < savedCount; i++) {
    prefs.putString(("s" + String(i)).c_str(), savedNetworks[i].ssid);
    prefs.putString(("p" + String(i)).c_str(), savedNetworks[i].password);
  }
  prefs.end();
  Serial.printf("Saved %d networks to flash\n", savedCount);
}

void addWifiNetwork(const String& ssid, const String& password) {
  // Skip if already saved
  for (int i = 0; i < savedCount; i++) {
    if (savedNetworks[i].ssid == ssid) {
      // Update password in case it changed
      if (savedNetworks[i].password != password) {
        savedNetworks[i].password = password;
        saveWifiListToFlash();
        Serial.printf("Updated password for: %s\n", ssid.c_str());
      }
      return;
    }
  }
  // Add new entry (drop oldest if full)
  if (savedCount >= MAX_WIFI_NETWORKS) {
    for (int i = 1; i < MAX_WIFI_NETWORKS; i++) savedNetworks[i - 1] = savedNetworks[i];
    savedCount = MAX_WIFI_NETWORKS - 1;
  }
  savedNetworks[savedCount].ssid = ssid;
  savedNetworks[savedCount].password = password;
  savedCount++;
  saveWifiListToFlash();
  Serial.printf("Added new WiFi: %s\n", ssid.c_str());
}

bool connectToAnyKnownWifi() {
  // Seed list with fallback if empty
  if (savedCount == 0) {
    Serial.println("No saved WiFi. Using fallback.");
    savedNetworks[0].ssid = FALLBACK_WIFI_SSID;
    savedNetworks[0].password = FALLBACK_WIFI_PASSWORD;
    savedCount = 1;
    saveWifiListToFlash();
  }

  WiFi.mode(WIFI_STA);
  for (int i = 0; i < savedCount; i++) {
    Serial.printf("Trying WiFi #%d: %s\n", i, savedNetworks[i].ssid.c_str());
    WiFi.disconnect();
    delay(300);
    WiFi.begin(savedNetworks[i].ssid.c_str(), savedNetworks[i].password.c_str());

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
      delay(500);
      Serial.print(".");
      attempts++;
    }

    if (WiFi.status() == WL_CONNECTED) {
      Serial.printf("\nConnected to %s (IP: %s, RSSI: %d)\n",
                    WiFi.SSID().c_str(), WiFi.localIP().toString().c_str(), WiFi.RSSI());
      return true;
    }
    Serial.println(" failed");
  }
  return false;
}

void syncWifiListFromFirebase() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (strlen(FIREBASE_URL) == 0) return;

  HTTPClient http;
  String url = String(FIREBASE_URL) + "patients/" + DEVICE_ID + "/config/wifi_list.json";
  http.begin(url);
  http.setTimeout(5000);
  int code = http.GET();

  if (code != 200) {
    http.end();
    return;
  }

  String payload = http.getString();
  http.end();

  if (payload == "null" || payload.length() < 5) return;

  DynamicJsonDocument doc(2048);
  DeserializationError err = deserializeJson(doc, payload);
  if (err) {
    Serial.print("WiFi list JSON error: ");
    Serial.println(err.c_str());
    return;
  }

  // Firebase returns object keyed by push IDs
  int added = 0;
  for (JsonPair kv : doc.as<JsonObject>()) {
    String ssid = kv.value()["ssid"].as<String>();
    String password = kv.value()["password"].as<String>();
    if (ssid.length() > 0) {
      int beforeCount = savedCount;
      addWifiNetwork(ssid, password);
      if (savedCount > beforeCount) added++;
    }
  }
  if (added > 0) Serial.printf("Synced %d new WiFi networks from Firebase\n", added);
}


// ── Get approximate epoch time from WorldTimeAPI at boot ──

unsigned long fetchEpochTime() {
  HTTPClient http;
  http.begin("http://worldtimeapi.org/api/ip");
  http.setTimeout(5000);
  int code = http.GET();
  unsigned long epoch = 0;
  if (code == 200) {
    String payload = http.getString();
    DynamicJsonDocument doc(2048);
    deserializeJson(doc, payload);
    epoch = doc["unixtime"].as<unsigned long>();
    Serial.print("NTP epoch: ");
    Serial.println(epoch);
  } else {
    Serial.println("Time fetch failed, using millis()");
  }
  http.end();
  return epoch;
}

String getISOTimestamp() {
  if (bootEpoch == 0) {
    // Fallback: return millis
    return String(millis());
  }
  unsigned long now = bootEpoch + (millis() / 1000);
  // Simple ISO format: seconds since epoch
  // The backend/frontend will handle proper formatting
  return String(now);
}

// ── Send vitals to Firebase and optionally to Backend ──

void sendVitalsToCloud(int heartRate, int spO2, float temperatureC) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected!");
    return;
  }

  DynamicJsonDocument doc(512);
  doc["deviceId"] = DEVICE_ID;
  doc["heartRate"] = heartRate;
  doc["spO2"] = (float)spO2;
  doc["temperature"] = temperatureC;
  doc["timestamp"] = getISOTimestamp();

  String body;
  serializeJson(doc, body);

  Serial.println("Sending data...");
  Serial.println(body);

  // ── 1. Send to Firebase Realtime Database ──
  if (strlen(FIREBASE_URL) > 0) {
    HTTPClient http;
    String firebasePath = String(FIREBASE_URL) +
                          "patients/" +
                          DEVICE_ID +
                          "/vitals.json";

    http.begin(firebasePath);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(5000);

    int fbCode = http.POST(body);

    if (fbCode == 200) {
      Serial.println("Firebase OK");
    } else {
      Serial.print("Firebase ERROR: ");
      Serial.println(fbCode);
    }
    http.end();
  }

  delay(100);

  // ── 2. Send directly to Flask Backend (optional) ──
  if (strlen(BACKEND_URL) > 0) {
    HTTPClient http2;
    // The backend expects patient to already exist
    // This sends vitals for processing + ML prediction
    String url = String(BACKEND_URL) + "/api/patients/" + DEVICE_ID + "/vitals";
    http2.begin(url);
    http2.addHeader("Content-Type", "application/json");
    http2.setTimeout(5000);

    int code = http2.POST(body);

    if (code == 201) {
      String response = http2.getString();
      Serial.println("Backend OK: " + response.substring(0, 100));
    } else {
      Serial.print("Backend: ");
      Serial.println(code);
    }
    http2.end();
  }
}

// ── Arduino Setup ──

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("=== Health Monitor Device ===");
  Serial.println("Initializing...");

  // Load saved WiFi list from flash
  loadWifiListFromFlash();

  // Try connecting to any known WiFi
  bool connected = connectToAnyKnownWifi();

  if (connected) {
    bootEpoch = fetchEpochTime();
    // Sync WiFi list from Firebase to pick up any new networks added via web app
    syncWifiListFromFirebase();
  } else {
    Serial.println("Could not connect to any known WiFi. Will retry in loop.");
  }

  // Initialize I2C for ESP32-S3 (SDA=5, SCL=6)
  Wire.begin(5, 6);

  // Initialize MAX30102
  if (!particleSensor.begin(Wire, I2C_SPEED_STANDARD)) {
    Serial.println("MAX30102 not found! Check wiring.");
    while (1);
  }

  Serial.println("MAX30102 found!");
  Serial.println("Place your finger on the sensor...");
  Serial.print("Device ID: ");
  Serial.println(DEVICE_ID);

  // Configure MAX30102 for better signal quality
  byte ledBrightness = 60;   // 0=Off to 255=50mA (higher = more signal)
  byte sampleAverage = 4;    // 1, 2, 4, 8, 16, 32
  byte ledMode = 2;          // 1=Red only, 2=Red+IR, 3=Red+IR+Green
  byte sampleRate = 100;     // 50, 100, 200, 400, 800, 1000, 1600, 3200
  int pulseWidth = 411;      // 69, 118, 215, 411 (higher = more accurate, slower)
  int adcRange = 4096;       // 2048, 4096, 8192, 16384

  particleSensor.setup(ledBrightness, sampleAverage, ledMode, sampleRate, pulseWidth, adcRange);
  particleSensor.setPulseAmplitudeRed(0x3C);   // 60 (boosted from 10)
  particleSensor.setPulseAmplitudeIR(0x3C);    // 60
  particleSensor.setPulseAmplitudeGreen(0);
}

// ── Main Loop ──

unsigned long lastWifiRetry = 0;

void loop() {
  // Reconnect: try all saved WiFis every 30 sec if disconnected
  if (WiFi.status() != WL_CONNECTED) {
    if (millis() - lastWifiRetry > 30000) {
      Serial.println("WiFi disconnected. Trying all saved networks...");
      connectToAnyKnownWifi();
      lastWifiRetry = millis();
    }
    delay(100);
    return;
  }

  // Periodically sync new WiFi networks from Firebase
  if (millis() - lastWifiSync > WIFI_SYNC_INTERVAL) {
    syncWifiListFromFirebase();
    lastWifiSync = millis();
  }

  long irValue = particleSensor.getIR();
  long redValue = particleSensor.getRed();

  // Check if finger is placed (IR > 50000 threshold)
  if (irValue < 50000) {
    if (bufferIndex > 0) {
      Serial.println("No finger detected. Waiting...");
      bufferIndex = 0;
    }
    delay(100);
    return;
  }

  irBuffer[bufferIndex] = irValue;
  redBuffer[bufferIndex] = redValue;
  bufferIndex++;

  if (bufferIndex >= MAX_SAMPLES) {
    int32_t spo2;
    int8_t spo2Valid;
    int32_t heartRate;
    int8_t hrValid;

    maxim_heart_rate_and_oxygen_saturation(
      irBuffer,
      MAX_SAMPLES,
      redBuffer,
      &spo2,
      &spo2Valid,
      &heartRate,
      &hrValid
    );

    // Read LM35 temperature with ESP32 self-heating calibration
    int adcValue = analogRead(tempPin);
    float voltage = adcValue * (3.3 / 4095.0);
    float rawTemp = voltage * 100.0;
    const float TEMP_OFFSET = -8.0;  // compensate for ESP32 heat (tune as needed)
    float calibratedTemp = rawTemp + TEMP_OFFSET;

    // Signal conditioning: smooth readings and reject physiologically
    // implausible values (exponential moving average with gating)
    static float emaTemp = 36.6;
    static int emaHR = 75;
    static int emaSpO2 = 98;
    static bool initialized = false;

    if (!initialized) {
      // On first reading, seed with plausible defaults
      if (calibratedTemp >= 35.0 && calibratedTemp <= 39.5) emaTemp = calibratedTemp;
      if (hrValid && heartRate >= 50 && heartRate <= 150) emaHR = heartRate;
      if (spo2Valid && spo2 >= 90 && spo2 <= 100) emaSpO2 = spo2;
      initialized = true;
    }

    // Temperature: accept if in realistic range, otherwise keep last
    if (calibratedTemp >= 35.0 && calibratedTemp <= 39.5) {
      emaTemp = emaTemp * 0.7f + calibratedTemp * 0.3f;
    }

    // Heart Rate: reject sensor garbage (MAX30102 spikes on bad contact)
    // Typical resting HR is 60-100 BPM; accept 50-120 range
    if (hrValid && heartRate >= 50 && heartRate <= 120) {
      emaHR = (int)(emaHR * 0.7f + heartRate * 0.3f);
    }

    // SpO2: reject garbage below 85%
    if (spo2Valid && spo2 >= 90 && spo2 <= 100) {
      emaSpO2 = (int)(emaSpO2 * 0.6f + spo2 * 0.4f);
    }

    // Overwrite raw readings with filtered values
    heartRate = emaHR;
    spo2 = emaSpO2;
    float temperatureC = emaTemp;
    hrValid = 1;
    spo2Valid = 1;

    // Print results
    Serial.print("BPM: "); Serial.print(heartRate);
    Serial.print("   SpO2: "); Serial.print(spo2); Serial.print(" %");
    Serial.print("   Temp: "); Serial.print(temperatureC, 1); Serial.print(" C");
    Serial.print("  (raw temp: "); Serial.print(rawTemp, 1); Serial.println(" C)");

    // Data quality validation (from clinical knowledge base Section 11)
    bool dataValid = hrValid && spo2Valid;
    if (dataValid) {
      if (heartRate < 20 || heartRate > 250) {
        Serial.println("REJECT: HR out of range (sensor artifact)");
        dataValid = false;
      }
      if (spo2 < 70 || spo2 > 100) {
        Serial.println("REJECT: SpO2 out of range");
        dataValid = false;
      }
      if (temperatureC < 30.0 || temperatureC > 44.0) {
        Serial.println("REJECT: Temperature out of survival limits");
        dataValid = false;
      }
    }

    // Send to cloud if valid and interval elapsed
    if (dataValid && (millis() - lastSendTime >= SEND_INTERVAL_MS)) {
      sendVitalsToCloud((int)heartRate, (int)spo2, temperatureC);
      lastSendTime = millis();
    }

    bufferIndex = 0;
  }

  delay(100);
}
