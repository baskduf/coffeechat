import { useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'
import { api, getApiErrorMessage } from './api'
import type { MatchSuggestion, OAuthProvider, Report } from './types'

const providers: OAuthProvider[] = ['google', 'kakao', 'apple']

function App() {
  const [userId, setUserId] = useState('')
  const [adminKey, setAdminKey] = useState('')
  const [output, setOutput] = useState('Ready')
  const [appointmentId, setAppointmentId] = useState('')
  const [proposalId, setProposalId] = useState('')
  const [suggestions, setSuggestions] = useState<MatchSuggestion[]>([])
  const [reports, setReports] = useState<Report[]>([])

  const run = async (label: string, fn: () => Promise<unknown>) => {
    try {
      const result = await fn()
      setOutput(`${label}\n${JSON.stringify(result, null, 2)}`)
    } catch (error) {
      setOutput(`Error: ${getApiErrorMessage(error)}`)
    }
  }

  const onAuth = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    await run('Auth success', async () => {
      const res = await api.auth(fd.get('provider') as OAuthProvider, String(fd.get('email')), String(fd.get('nickname')))
      setUserId(res.user.id)
      return res
    })
  }

  return (
    <div className="layout">
      <header>
        <h1>CoffeeChat Frontend MVP</h1>
        <p>Backend: {import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000'}</p>
        <div className="inputs">
          <input placeholder="Current User ID" value={userId} onChange={(e) => setUserId(e.target.value)} />
          <input placeholder="Admin API Key" value={adminKey} onChange={(e) => setAdminKey(e.target.value)} />
          <input placeholder="Proposal ID" value={proposalId} onChange={(e) => setProposalId(e.target.value)} />
          <input placeholder="Appointment ID" value={appointmentId} onChange={(e) => setAppointmentId(e.target.value)} />
        </div>
      </header>

      <section className="panel">
        <h2>1) Mock Auth</h2>
        <form onSubmit={onAuth} className="grid2">
          <select name="provider" defaultValue="google">
            {providers.map((provider) => (
              <option key={provider}>{provider}</option>
            ))}
          </select>
          <input name="email" placeholder="email@example.com" required />
          <input name="nickname" placeholder="nickname" required />
          <button type="submit">Login / Upsert</button>
        </form>
        <button onClick={() => run('Phone verify', () => api.verifyPhone(userId))}>Verify Phone</button>
      </section>

      <section className="panel">
        <h2>2) Profile / Interests</h2>
        <div className="actions">
          <button onClick={() => run('Load me', () => api.me(userId))}>Load Me</button>
          <button onClick={() => run('Update profile', () => api.updateProfile({ userId, nickname: 'Coffee Friend', bio: 'Let us chat', region: 'seoul' }))}>
            Quick Profile Update
          </button>
          <button onClick={() => run('Update interests', () => api.updateInterests({ userId, interests: ['coffee', 'startup', 'design'] }))}>
            Quick Interests Update
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>3) Availability</h2>
        <div className="actions">
          <button onClick={() => run('Availability list', () => api.availability(userId))}>List Slots</button>
          <button
            onClick={() =>
              run('Add slot', () => api.addAvailability({ userId, weekday: 2, startTime: '10:00', endTime: '11:30', area: 'Gangnam' }))
            }
          >
            Add Sample Slot
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>4) Match Suggestions / Proposals</h2>
        <div className="actions">
          <button
            onClick={() =>
              run('Suggestions', async () => {
                const res = await api.suggestions(userId)
                setSuggestions(res)
                return res
              })
            }
          >
            Load Suggestions
          </button>
          <button
            onClick={() =>
              run('Create proposal', () =>
                api.createProposal({ proposerId: userId, partnerId: suggestions[0]?.user.id ?? '', message: 'Coffee this Friday?' }),
              )
            }
          >
            Propose to Top Suggestion
          </button>
          <button onClick={() => run('My proposals', () => api.proposals(userId))}>Load Proposals</button>
          <button
            onClick={() =>
              run('Accept proposal', () =>
                api.acceptProposal(proposalId, { accepterId: userId, place: 'Cafe Layered', startsAt: new Date(Date.now() + 86400000).toISOString() }),
              )
            }
          >
            Accept Proposal
          </button>
          <button onClick={() => run('Reject proposal', () => api.rejectProposal(proposalId, userId))}>Reject Proposal</button>
        </div>
      </section>

      <section className="panel">
        <h2>5) Appointments / Check-in / Review / Report</h2>
        <div className="actions">
          <button onClick={() => run('Appointment detail', () => api.appointment(appointmentId))}>Load Appointment</button>
          <button onClick={() => run('Check-in', () => api.checkin(appointmentId, { userId, code: '1234' }))}>Check-in (sample code)</button>
          <button
            onClick={() =>
              run('No-show', () => api.noShow(appointmentId, { reporterId: userId, targetUserId: '', reason: 'did not arrive' }))
            }
          >
            Report No-show
          </button>
          <button
            onClick={() =>
              run('Review', () => api.review(appointmentId, { reviewerId: userId, revieweeId: '', comment: 'Great conversation', scoreDelta: 2 }))
            }
          >
            Submit Review
          </button>
          <button
            onClick={() => run('Report', () => api.report(appointmentId, { reporterId: userId, targetUserId: '', reason: 'inappropriate behavior' }))}
          >
            Submit Incident Report
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>6) Admin Reports (key input)</h2>
        <button
          onClick={() =>
            run('Open reports', async () => {
              const res = await api.adminReports(adminKey)
              setReports(res)
              return res
            })
          }
        >
          Load Open Reports
        </button>
        <p>Open report count: {reports.length}</p>
      </section>

      <section className="panel output">
        <h2>Output</h2>
        <pre>{output}</pre>
      </section>
    </div>
  )
}

export default App
