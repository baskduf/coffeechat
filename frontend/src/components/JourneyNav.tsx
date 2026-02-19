import { Badge } from './ui'

export type JourneyStep = {
  key: string
  label: string
  desc: string
}

export function JourneyNav({
  steps,
  active,
  completed,
  onSelect,
}: {
  steps: JourneyStep[]
  active: string
  completed: Set<string>
  onSelect: (step: string) => void
}) {
  return (
    <nav className="journey-nav" aria-label="CoffeeChat MVP flow">
      {steps.map((step, index) => {
        const isActive = active === step.key
        return (
          <button
            key={step.key}
            className={`journey-item${isActive ? ' active' : ''}`}
            onClick={() => onSelect(step.key)}
            type="button"
          >
            <div className="journey-item-title">
              <strong>
                {index + 1}. {step.label}
              </strong>
              {completed.has(step.key) ? <Badge tone="good">완료</Badge> : null}
            </div>
            <p>{step.desc}</p>
          </button>
        )
      })}
    </nav>
  )
}
