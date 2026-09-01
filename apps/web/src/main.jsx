import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import './styles.css'
import App from './App.jsx'
import { retry, retryDelay } from './lib/queryRetry.js'

// Every default here is load-bearing, so none of them are left to react-query's own defaults.
//
// `staleTime: 0` (the default) means every mount refetches. Eight components ask for `session`
// and seven for `scans`, so a single route change re-fetched both several times over; with
// `refetchOnWindowFocus` on top, coming back to the tab refetched every active query at once.
// One minute of staleness is invisible to the user and removes almost all of that traffic.
//
// `retry` is the dangerous one. The default of 3 means four attempts per query, so the moment
// the API slows down the client multiplies its own load fourfold and finishes the job. See
// lib/queryRetry.js for why a 4xx is never retried.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry,
      retryDelay,
    },
    // Explicit rather than inherited: react-query does not retry mutations by default, and a
    // scan or a chat turn must never be sent twice on our own initiative. Until the idempotency
    // keys land, a retried POST is a duplicate charge.
    mutations: { retry: 0 },
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
)
