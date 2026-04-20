import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

export default function VitalsChart({ vitals }) {
  if (!vitals || vitals.length === 0) {
    return <div className="text-gray-500 text-center py-8">No vitals data to display</div>
  }

  const data = vitals.map((v, i) => ({
    idx: i + 1,
    time: v.timestamp ? new Date(v.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : `#${i + 1}`,
    heartRate: v.heart_rate,
    spO2: v.spo2,
    temperature: v.temperature,
    news2: v.news2_score,
  }))

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
        <h3 className="text-base font-semibold mb-4">Heart Rate & SpO2 Trend</h3>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="time" tick={{ fontSize: 12 }} />
            <YAxis yAxisId="hr" domain={['auto', 'auto']} tick={{ fontSize: 12 }} />
            <YAxis yAxisId="spo2" orientation="right" domain={[70, 100]} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <Line yAxisId="hr" type="monotone" dataKey="heartRate" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} name="Heart Rate (BPM)" />
            <Line yAxisId="spo2" type="monotone" dataKey="spO2" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="SpO2 (%)" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
        <h3 className="text-base font-semibold mb-4">Temperature & NEWS2 Score</h3>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="time" tick={{ fontSize: 12 }} />
            <YAxis yAxisId="temp" domain={['auto', 'auto']} tick={{ fontSize: 12 }} />
            <YAxis yAxisId="news2" orientation="right" domain={[0, 8]} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <Line yAxisId="temp" type="monotone" dataKey="temperature" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} name="Temperature (°C)" />
            <Line yAxisId="news2" type="monotone" dataKey="news2" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} name="NEWS2 Score" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
