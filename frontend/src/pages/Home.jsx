import { Link } from 'react-router-dom'
import {
  Activity, Heart, Shield, Brain, Stethoscope, Wifi, FileText,
  ArrowRight, CheckCircle, Users, Clock, Zap, ChevronRight,
  Thermometer, Wind, MonitorSmartphone, Bell, TrendingUp, BarChart3
} from 'lucide-react'

export default function Home() {
  return (
    <div className="bg-white">
      {/* ── Hero ── */}
      <section className="relative bg-gradient-to-br from-teal-700 via-teal-600 to-cyan-600 overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-20 w-96 h-96 bg-cyan-300 rounded-full blur-3xl" />
        </div>
        <div className="max-w-7xl mx-auto px-4 py-24 md:py-32 relative z-10">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm px-4 py-2 rounded-full text-teal-100 text-sm mb-6">
                <Activity className="w-4 h-4" />
                AI-Powered Health Monitoring
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight">
                Smart Health
                <span className="block text-cyan-200">Monitoring System</span>
              </h1>
              <p className="text-lg text-teal-100 mt-6 max-w-lg leading-relaxed">
                Real-time patient vital monitoring with AI-powered clinical predictions.
                Track heart rate, SpO2, and temperature with instant health assessments
                powered by machine learning.
              </p>
              <div className="flex flex-wrap gap-4 mt-8">
                <Link to="/register"
                  className="inline-flex items-center gap-2 bg-white text-teal-700 px-8 py-3.5 rounded-lg font-semibold hover:bg-teal-50 transition-all shadow-lg shadow-teal-900/20">
                  Get Started <ArrowRight className="w-5 h-5" />
                </Link>
                <Link to="/login"
                  className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm text-white border border-white/30 px-8 py-3.5 rounded-lg font-semibold hover:bg-white/20 transition-all">
                  Sign In
                </Link>
              </div>
            </div>
            <div className="hidden md:block">
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20 shadow-2xl">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                  <span className="text-white/60 text-xs ml-2">Live Patient Monitor</span>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-white/10 rounded-xl p-4 text-center">
                    <Heart className="w-6 h-6 text-red-300 mx-auto mb-2" />
                    <div className="text-2xl font-bold text-white">78</div>
                    <div className="text-xs text-white/60">BPM</div>
                  </div>
                  <div className="bg-white/10 rounded-xl p-4 text-center">
                    <Wind className="w-6 h-6 text-blue-300 mx-auto mb-2" />
                    <div className="text-2xl font-bold text-white">98</div>
                    <div className="text-xs text-white/60">SpO2 %</div>
                  </div>
                  <div className="bg-white/10 rounded-xl p-4 text-center">
                    <Thermometer className="w-6 h-6 text-orange-300 mx-auto mb-2" />
                    <div className="text-2xl font-bold text-white">36.6</div>
                    <div className="text-xs text-white/60">Temp °C</div>
                  </div>
                </div>
                <div className="bg-emerald-500/20 border border-emerald-400/30 rounded-lg p-3 flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-emerald-300" />
                  <div>
                    <div className="text-white text-sm font-semibold">Status: Healthy</div>
                    <div className="text-emerald-200 text-xs">Risk Score: 4.5/100 | LOW | MEWS: 0</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* Wave divider */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 80" fill="none" className="w-full"><path d="M0 80L48 74.7C96 69 192 59 288 53.3C384 48 480 48 576 53.3C672 59 768 69 864 69.3C960 69 1056 59 1152 53.3C1248 48 1344 48 1392 48L1440 48V80H1392C1344 80 1248 80 1152 80C1056 80 960 80 864 80C768 80 672 80 576 80C480 80 384 80 288 80C192 80 96 80 48 80H0Z" fill="white"/></svg>
        </div>
      </section>


      {/* ── About / What We Do ── */}
      <section id="about" className="max-w-7xl mx-auto px-4 py-20 scroll-mt-20">
        <div className="text-center mb-14">
          <span className="text-teal-600 font-semibold text-sm uppercase tracking-wider">About The Platform</span>
          <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mt-3">
            Intelligent Health Monitoring<br />for Better Patient Outcomes
          </h2>
          <p className="text-gray-500 mt-4 max-w-2xl mx-auto">
            Our system combines IoT wearable sensors with advanced machine learning to provide
            real-time clinical decision support for healthcare professionals and patients.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              icon: MonitorSmartphone, color: 'bg-teal-50 text-teal-600',
              title: 'Wearable IoT Device',
              desc: 'ESP32-S3 powered device with MAX30102 (Heart Rate & SpO2) and LM35 (Temperature) sensors for continuous vital monitoring.'
            },
            {
              icon: Brain, color: 'bg-cyan-50 text-cyan-600',
              title: 'AI Clinical Prediction',
              desc: 'Random Forest classifier with 21 features including Shock Index, MEWS, ODI, and MAP — detects 12 clinical scenarios from 3 sensor readings in real-time.'
            },
            {
              icon: FileText, color: 'bg-emerald-50 text-emerald-600',
              title: 'Professional Health Reports',
              desc: 'Auto-generated clinical reports with MEWS scoring, composite risk assessment (0-100), SIRS screening, and guideline-referenced recommendations.'
            },
          ].map((item, i) => (
            <div key={i} className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
              <div className={`w-14 h-14 ${item.color} rounded-xl flex items-center justify-center mb-5`}>
                <item.icon className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-3">{item.title}</h3>
              <p className="text-gray-500 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="bg-slate-50 py-20">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-14">
            <span className="text-teal-600 font-semibold text-sm uppercase tracking-wider">How It Works</span>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mt-3">From Sensor to Diagnosis in Seconds</h2>
          </div>
          <div className="grid md:grid-cols-4 gap-6">
            {[
              { step: '01', icon: Wifi, title: 'Sensor Capture', desc: 'MAX30102 and LM35 sensors read heart rate, SpO2, and temperature from the patient.' },
              { step: '02', icon: Zap, title: 'Data Transmission', desc: 'ESP32-S3 sends readings to Firebase in real-time over WiFi every 10 seconds.' },
              { step: '03', icon: Brain, title: 'AI Analysis', desc: 'ML model computes 8 derived parameters (Shock Index, ODI, MEWS, MAP, STRS, RPP, RR Proxy, BSA) and predicts from 12 clinical scenarios.' },
              { step: '04', icon: FileText, title: 'Clinical Report', desc: 'Risk scoring (0-100), clinical protocols, vital-sign guidance, and trend analysis are generated instantly.' },
            ].map((item, i) => (
              <div key={i} className="relative">
                <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm h-full">
                  <div className="text-4xl font-black text-teal-100 mb-3">{item.step}</div>
                  <div className="w-12 h-12 bg-teal-50 text-teal-600 rounded-xl flex items-center justify-center mb-4">
                    <item.icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 mb-2">{item.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{item.desc}</p>
                </div>
                {i < 3 && <ChevronRight className="hidden md:block absolute top-1/2 -right-4 w-6 h-6 text-teal-300 -translate-y-1/2 z-10" />}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features for Doctors & Patients ── */}
      <section id="features" className="max-w-7xl mx-auto px-4 py-20 scroll-mt-20">
        <div className="text-center mb-14">
          <span className="text-teal-600 font-semibold text-sm uppercase tracking-wider">Features</span>
          <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mt-3">Built for Healthcare Professionals & Patients</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-10">
          {/* Doctor features */}
          <div className="bg-gradient-to-br from-teal-600 to-cyan-600 rounded-2xl p-8 text-white">
            <div className="flex items-center gap-3 mb-6">
              <Stethoscope className="w-8 h-8" />
              <h3 className="text-2xl font-bold">For Doctors</h3>
            </div>
            <ul className="space-y-4">
              {[
                'Dashboard with all your patients at a glance',
                'Real-time vital monitoring with live device feeds',
                'AI prediction with 8 derived parameters (SI, ODI, MEWS, MAP, STRS, RPP, RR, BSA)',
                'MEWS scoring + composite risk assessment (0-100)',
                'SIRS / Sepsis automated screening',
                'Continuous monitoring with trend detection',
                'Professional health reports with clinical recommendations',
                'Patient deterioration pattern alerts',
              ].map((f, i) => (
                <li key={i} className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-cyan-200 shrink-0 mt-0.5" />
                  <span className="text-teal-50">{f}</span>
                </li>
              ))}
            </ul>
          </div>
          {/* Patient features */}
          <div className="bg-white border-2 border-gray-100 rounded-2xl p-8">
            <div className="flex items-center gap-3 mb-6">
              <Shield className="w-8 h-8 text-emerald-600" />
              <h3 className="text-2xl font-bold text-slate-800">For Patients</h3>
            </div>
            <ul className="space-y-4">
              {[
                'Personal health dashboard with latest vitals',
                'View your AI health status and predictions',
                'Track vital sign trends over time with charts',
                'Receive health alerts and warnings',
                'Access your clinical health report anytime',
                'See risk score (0-100) with LOW/MEDIUM/HIGH/CRITICAL levels',
                'Understand your derived vitals (Shock Index, ODI, MEWS, MAP)',
                'Linked to your doctor for coordinated care',
              ].map((f, i) => (
                <li key={i} className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                  <span className="text-gray-600">{f}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── Clinical Scenarios ── */}
      <section className="bg-slate-50 py-20">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-14">
            <span className="text-teal-600 font-semibold text-sm uppercase tracking-wider">AI Capabilities</span>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mt-3">12 Clinical Scenarios Detected</h2>
            <p className="text-gray-500 mt-4">Trained on clinical guidelines from AHA, WHO, SSC, GOLD, GINA, ESC, BTS, and more</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { name: 'Healthy', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
              { name: 'Fever', color: 'bg-amber-50 text-amber-700 border-amber-200' },
              { name: 'Pneumonia', color: 'bg-orange-50 text-orange-700 border-orange-200' },
              { name: 'Sepsis / SIRS', color: 'bg-red-50 text-red-700 border-red-200' },
              { name: 'Cardiac Event', color: 'bg-red-50 text-red-700 border-red-200' },
              { name: 'Hypoxia', color: 'bg-blue-50 text-blue-700 border-blue-200' },
              { name: 'Respiratory Distress', color: 'bg-orange-50 text-orange-700 border-orange-200' },
              { name: 'COPD Exacerbation', color: 'bg-amber-50 text-amber-700 border-amber-200' },
              { name: 'Asthma Exacerbation', color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
              { name: 'Heart Failure', color: 'bg-red-50 text-red-700 border-red-200' },
              { name: 'Hypertension Crisis', color: 'bg-orange-50 text-orange-700 border-orange-200' },
              { name: 'Critical Condition', color: 'bg-red-50 text-red-700 border-red-200' },
            ].map((s, i) => (
              <div key={i} className={`${s.color} border rounded-xl px-4 py-3 text-center text-sm font-semibold`}>
                {s.name}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Technology Stack ── */}
      <section className="max-w-7xl mx-auto px-4 py-20">
        <div className="text-center mb-14">
          <span className="text-teal-600 font-semibold text-sm uppercase tracking-wider">Technology</span>
          <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mt-3">Powered by Modern Technology</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
          {[
            { name: 'ESP32-S3', desc: 'IoT Microcontroller' },
            { name: 'MAX30102', desc: 'HR & SpO2 Sensor' },
            { name: 'LM35', desc: 'Temperature Sensor' },
            { name: 'Firebase', desc: 'Real-time Database' },
            { name: 'scikit-learn', desc: 'ML Framework' },
          ].map((t, i) => (
            <div key={i} className="bg-white border border-gray-100 rounded-xl p-5 text-center shadow-sm hover:shadow-md transition-shadow">
              <div className="text-lg font-bold text-slate-800">{t.name}</div>
              <div className="text-xs text-gray-500 mt-1">{t.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="bg-gradient-to-r from-teal-700 to-cyan-600 py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white">
            Ready to Transform Patient Monitoring?
          </h2>
          <p className="text-teal-100 mt-4 text-lg max-w-2xl mx-auto">
            Join as a doctor to manage your patients, or register as a patient to track your health in real-time.
          </p>
          <div className="flex flex-wrap justify-center gap-4 mt-8">
            <Link to="/register"
              className="inline-flex items-center gap-2 bg-white text-teal-700 px-8 py-3.5 rounded-lg font-semibold hover:bg-teal-50 transition-all shadow-lg">
              Register Now <ArrowRight className="w-5 h-5" />
            </Link>
            <Link to="/login"
              className="inline-flex items-center gap-2 bg-transparent text-white border-2 border-white/40 px-8 py-3.5 rounded-lg font-semibold hover:bg-white/10 transition-all">
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-slate-900 text-gray-400 py-16">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-10">
            <div>
              <div className="flex items-center gap-2 text-xl font-bold text-white mb-4">
                <Activity className="w-6 h-6 text-teal-400" />
                HealthMonitor
              </div>
              <p className="text-sm leading-relaxed">
                AI-powered smart portable patient monitoring system using MAX30102 and LM35 sensors
                for real-time health assessment and clinical decision support.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Platform</h4>
              <ul className="space-y-2 text-sm">
                <li><Link to="/register" className="hover:text-teal-400 transition-colors">Register</Link></li>
                <li><Link to="/login" className="hover:text-teal-400 transition-colors">Sign In</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Clinical Standards</h4>
              <ul className="space-y-2 text-sm">
                <li>MEWS (Subbe et al. 2001)</li>
                <li>AHA/ACC Guidelines</li>
                <li>WHO Standards</li>
                <li>GOLD COPD 2023</li>
                <li>Surviving Sepsis 2021</li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Sensors</h4>
              <ul className="space-y-2 text-sm">
                <li>MAX30102 — Heart Rate & SpO2</li>
                <li>LM35 — Body Temperature</li>
                <li>ESP32-S3 — Microcontroller</li>
                <li>Firebase — Cloud Database</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-800 mt-12 pt-8 text-center text-sm">
            <p>Smart Portable Patient Monitoring Device | AI-Powered Clinical Decision Support System</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
