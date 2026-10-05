import { useEffect, useState } from 'react'
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Check, CircleHelp, Clock3, Factory, Flame, Gauge, Network, Radio, RotateCw, ServerCrash, ShieldCheck, Wifi, WifiOff, Zap } from 'lucide-react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import './App.css'

type Status = 'running' | 'warning' | 'critical'
type FaultName = 'hardware' | 'latency' | 'outage'

type Station = {
  id: string
  name: string
  temperature: number
  vibration: number
  parts: number
  status: Status
}

type TelemetryPoint = {
  time: string
  weldingTemperature: number
  paintTemperature: number
  assemblyTemperature: number
  weldingVibration: number
  paintVibration: number
  assemblyVibration: number
}

type Incident = { time: string; message: string; severity: string }
type FactoryState = {
  generatedAt: string
  stations: Station[]
  history: TelemetryPoint[]
  incidents: Incident[]
  faults: Record<FaultName, boolean>
}

const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
const faultOptions: { id: FaultName; name: string; description: string; icon: typeof Flame }[] = [
  { id: 'hardware', name: 'Thermal overload', description: 'Welding robot above 100°C', icon: Flame },
  { id: 'latency', name: 'API latency', description: 'Add 2 seconds to responses', icon: Network },
  { id: 'outage', name: 'Service outage', description: 'Fail 30% of API requests', icon: ServerCrash },
]

const statusLabel: Record<Status, string> = {
  running: 'Running',
  warning: 'Warning',
  critical: 'Critical',
}

function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

function App() {
  const [factory, setFactory] = useState<FactoryState | null>(null)
  const [connected, setConnected] = useState(false)
  const [faultBusy, setFaultBusy] = useState<FaultName | null>(null)
  const [requestError, setRequestError] = useState('')

  useEffect(() => {
    let active = true
    const poll = async () => {
      try {
        const response = await fetch(`${API_URL}/api/state`, { cache: 'no-store' })
        if (!response.ok) throw new Error(`API returned ${response.status}`)
        const nextState = (await response.json()) as FactoryState
        if (active) {
          setFactory(nextState)
          setConnected(true)
          setRequestError('')
        }
      } catch {
        if (active) {
          setConnected(false)
          setRequestError('Unable to reach the factory API')
        }
      }
    }

    void poll()
    const interval = window.setInterval(() => void poll(), 1000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [])

  const toggleFault = async (fault: FaultName) => {
    if (!factory || faultBusy) return
    setFaultBusy(fault)
    try {
      const response = await fetch(`${API_URL}/api/faults/${fault}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !factory.faults[fault] }),
      })
      if (!response.ok) throw new Error(`API returned ${response.status}`)
      setFactory((await response.json()) as FactoryState)
      setRequestError('')
    } catch {
      setRequestError('Fault control failed. Check the API connection and retry.')
    } finally {
      setFaultBusy(null)
    }
  }

  const stations = factory?.stations ?? []
  const totalParts = stations.reduce((total, station) => total + station.parts, 0)
  const criticalCount = stations.filter((station) => station.status === 'critical').length
  const activeCount = stations.filter((station) => station.status !== 'critical').length
  const lastUpdated = factory ? timeLabel(factory.generatedAt) : '--:--:--'

  return (
    <div className="app-shell">
      <aside className="rail">
        <a className="brand-mark" href="#overview" aria-label="FactoryPulse home"><Activity size={20} strokeWidth={2.5} /></a>
        <div className="rail-rule" />
        <a className="rail-link active" href="#overview" aria-label="Plant overview" title="Plant overview"><Gauge size={19} /></a>
        <a className="rail-link" href="#telemetry" aria-label="Telemetry" title="Telemetry"><Activity size={19} /></a>
        <a className="rail-link" href="#incidents" aria-label="Incidents" title="Incidents"><AlertTriangle size={19} /></a>
        <div className="rail-bottom"><span className={`rail-health ${connected ? 'online' : ''}`} /></div>
      </aside>

      <main id="overview" className="workspace">
        <header className="topbar">
          <div className="breadcrumbs"><span>OPERATIONS</span><span className="crumb-slash">/</span><strong>Plant 01</strong></div>
          <div className="topbar-meta">
            <div className={`connection ${connected ? 'connected' : ''}`}>
              {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
              <span>{connected ? 'LIVE SYSTEM' : 'API DISCONNECTED'}</span>
            </div>
            <span className="topbar-divider" />
            <span className="clock"><Clock3 size={14} /> Updated {lastUpdated}</span>
          </div>
        </header>

        <div className="page-content">
          <section className="page-heading">
            <div>
              <div className="eyebrow"><Factory size={14} /> FACTORYPULSE <span>·</span> PRODUCTION MONITOR</div>
              <h1>Plant overview</h1>
              <p>Three production stations · telemetry refreshes every second</p>
            </div>
            <div className="shift-chip"><span className="shift-dot" /> SHIFT A <span className="shift-time">06:00 — 14:00</span></div>
          </section>

          {requestError && <div className="inline-alert" role="status"><AlertTriangle size={15} />{requestError}</div>}

          <section className="station-grid" aria-label="Station health">
            {stations.length ? stations.map((station, index) => (
              <article className={`station-card status-${station.status}`} key={station.id}>
                <div className="station-topline"><span className="station-index">0{index + 1}</span><span className={`status-pill ${station.status}`}><span />{statusLabel[station.status]}</span></div>
                <h2>{station.name}</h2>
                <div className="station-metrics">
                  <div className="primary-reading"><span>Temperature</span><strong>{station.temperature.toFixed(1)}<small>°C</small></strong></div>
                  <div className="secondary-reading"><span>Vibration</span><strong>{station.vibration.toFixed(2)} <small>mm/s</small></strong></div>
                </div>
                <div className="station-footer"><span>PARTS PRODUCED</span><strong>{station.parts.toLocaleString()}</strong></div>
              </article>
            )) : <div className="loading-panel"><span className="loading-pulse" />Waiting for station telemetry</div>}
          </section>

          <section className="metric-strip" aria-label="Production summary">
            <div className="summary-item"><span className="summary-icon green"><Check size={15} /></span><div><span>Stations available</span><strong>{stations.length ? `${activeCount} / ${stations.length}` : '— / 3'}</strong></div><ArrowUpRight className="summary-trend" size={15} /></div>
            <div className="summary-item"><span className="summary-icon blue"><Zap size={15} /></span><div><span>Parts this shift</span><strong>{totalParts.toLocaleString()}</strong></div><ArrowUpRight className="summary-trend" size={15} /></div>
            <div className="summary-item"><span className="summary-icon red"><AlertTriangle size={15} /></span><div><span>Critical stations</span><strong>{stations.length ? criticalCount : '—'}</strong></div>{criticalCount > 0 && <ArrowDownRight className="summary-trend danger" size={15} />}</div>
            <div className="summary-item"><span className="summary-icon slate"><Radio size={15} /></span><div><span>Telemetry window</span><strong>{factory ? `${factory.history.length} samples` : 'Connecting'}</strong></div><span className="sample-live"><span />1s</span></div>
          </section>

          <section className="telemetry-section" id="telemetry">
            <div className="section-heading"><div><div className="eyebrow">LIVE TELEMETRY</div><h2>Process signals</h2></div><div className="chart-legend"><span><i className="legend-dot weld" />Welding</span><span><i className="legend-dot paint" />Paint</span><span><i className="legend-dot assembly" />Assembly</span></div></div>
            <div className="chart-grid">
              <article className="chart-panel">
                <div className="chart-title"><div><h3>Temperature</h3><span>Station temperature · °C</span></div><span className="chart-range">LAST 90 SEC</span></div>
                <div className="chart-wrap">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={factory?.history ?? []} margin={{ top: 12, right: 12, bottom: 0, left: -15 }}>
                      <CartesianGrid stroke="#e9ece8" vertical={false} />
                      <XAxis dataKey="time" tickFormatter={timeLabel} tickLine={false} axisLine={false} minTickGap={40} />
                      <YAxis domain={[0, 120]} ticks={[0, 30, 60, 90, 120]} tickLine={false} axisLine={false} />
                      <Tooltip labelFormatter={(label) => timeLabel(String(label))} formatter={(value) => [`${Number(value).toFixed(1)} °C`]} />
                      <ReferenceLine y={100} stroke="#d8564e" strokeDasharray="4 4" />
                      <Line type="monotone" dataKey="weldingTemperature" name="Welding" stroke="#d65c42" strokeWidth={2} dot={false} isAnimationActive={false} />
                      <Line type="monotone" dataKey="paintTemperature" name="Paint" stroke="#3975a8" strokeWidth={2} dot={false} isAnimationActive={false} />
                      <Line type="monotone" dataKey="assemblyTemperature" name="Assembly" stroke="#3b8a69" strokeWidth={2} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </article>
              <article className="chart-panel">
                <div className="chart-title"><div><h3>Vibration</h3><span>RMS velocity · mm/s</span></div><span className="chart-range">LAST 90 SEC</span></div>
                <div className="chart-wrap">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={factory?.history ?? []} margin={{ top: 12, right: 12, bottom: 0, left: -15 }}>
                      <CartesianGrid stroke="#e9ece8" vertical={false} />
                      <XAxis dataKey="time" tickFormatter={timeLabel} tickLine={false} axisLine={false} minTickGap={40} />
                      <YAxis domain={[0, 10]} ticks={[0, 2.5, 5, 7.5, 10]} tickLine={false} axisLine={false} />
                      <Tooltip labelFormatter={(label) => timeLabel(String(label))} formatter={(value) => [`${Number(value).toFixed(2)} mm/s`]} />
                      <ReferenceLine y={7.5} stroke="#d99b3d" strokeDasharray="4 4" />
                      <Line type="monotone" dataKey="weldingVibration" name="Welding" stroke="#d65c42" strokeWidth={2} dot={false} isAnimationActive={false} />
                      <Line type="monotone" dataKey="paintVibration" name="Paint" stroke="#3975a8" strokeWidth={2} dot={false} isAnimationActive={false} />
                      <Line type="monotone" dataKey="assemblyVibration" name="Assembly" stroke="#3b8a69" strokeWidth={2} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </article>
            </div>
          </section>

          <section className="bottom-grid">
            <article className="panel incidents-panel" id="incidents">
              <div className="panel-heading"><div><div className="eyebrow">EVENT STREAM</div><h2>Recent incidents</h2></div><span className="event-count">{factory?.incidents.length ?? 0} EVENTS</span></div>
              {factory?.incidents.length ? <div className="incident-list">{factory.incidents.slice(0, 6).map((incident, index) => (
                <div className="incident-row" key={`${incident.time}-${index}`}><span className={`incident-mark ${incident.severity}`}><AlertTriangle size={13} /></span><div className="incident-copy"><strong>{incident.message}</strong><span>{timeLabel(incident.time)}</span></div><span className={`incident-severity ${incident.severity}`}>{incident.severity}</span></div>
              ))}</div> : <div className="empty-incidents"><ShieldCheck size={19} /><span>No incidents recorded</span><small>System events will appear here</small></div>}
            </article>

            <article className="panel chaos-panel">
              <div className="panel-heading"><div><div className="eyebrow">CHAOS ENGINEERING</div><h2>Fault injection</h2></div><span className="help-icon" title="Faults affect the live simulator and can be disabled at any time"><CircleHelp size={16} /></span></div>
              <div className="fault-list">{faultOptions.map(({ id, name, description, icon: Icon }) => {
                const active = factory?.faults[id] ?? false
                return <div className={`fault-row ${active ? 'fault-active' : ''}`} key={id}><span className={`fault-icon ${id}`}><Icon size={16} /></span><div className="fault-label"><strong>{name}</strong><span>{description}</span></div><button className={`toggle ${active ? 'on' : ''}`} type="button" role="switch" aria-checked={active} aria-label={`${active ? 'Disable' : 'Enable'} ${name}`} disabled={!factory || faultBusy !== null} onClick={() => void toggleFault(id)}><span /></button></div>
              })}</div>
              <div className="fault-footnote"><RotateCw size={12} /> Changes apply immediately to the simulator</div>
            </article>
          </section>

          <footer className="page-footer"><span>FACTORYPULSE <span className="footer-separator">/</span> PLANT 01</span><span><span className={`footer-status ${connected ? 'online' : ''}`} />{connected ? 'All systems operational' : 'Waiting for backend'} <span className="footer-separator">·</span> API <code>/api/health</code></span></footer>
        </div>
      </main>
    </div>
  )
}

export default App
