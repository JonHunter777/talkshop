import { useApiHealth, type ApiHealthStatus } from './features/health/useApiHealth'

const STATUS_VIEW: Record<ApiHealthStatus, { label: string; className: string }> = {
  loading: { label: 'API: проверка…', className: 'text-stone' },
  ok: { label: 'API: ok', className: 'text-moss' },
  unavailable: { label: 'API: недоступен', className: 'text-clay' },
}

function App() {
  const status = useApiHealth()
  const view = STATUS_VIEW[status]

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col items-center justify-center gap-4 px-4 md:px-8">
      <h1 className="text-4xl font-medium tracking-tight md:text-5xl">talkshop</h1>
      {/* role="status" announces the change to screen readers */}
      <p role="status" className={`text-sm ${view.className}`}>
        {view.label}
      </p>
    </main>
  )
}

export default App
