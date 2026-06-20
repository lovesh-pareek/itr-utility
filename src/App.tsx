import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { AppShell } from './components/shared'
import { ErrorBoundary } from './components/shared/ErrorBoundary'
import { StorageToast } from './components/shared/StorageToast'

// Screens
import S01Landing from './screens/S01Landing'
import S02Upload from './screens/S02Upload'
import S03Parsing from './screens/S03Parsing'
import S04Review from './screens/S04Review'
import S05Summary from './screens/S05Summary'
import S06Export from './screens/S06Export'
import S07AILog from './screens/S07AILog'
import S08Settings from './screens/S08Settings'
import Diagnostic from './screens/Diagnostic'

function AppRoutes() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<S01Landing />} />
        <Route path="/upload" element={<S02Upload />} />
        <Route path="/parsing" element={<S03Parsing />} />
        <Route path="/review" element={<S04Review />} />
        <Route path="/summary" element={<S05Summary />} />
        <Route path="/export" element={<S06Export />} />
        <Route path="/settings/ai-log" element={<S07AILog />} />
        <Route path="/settings" element={<S08Settings />} />
        {/* Catch-all */}
        <Route path="/diagnostic" element={<Diagnostic />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <BrowserRouter>
          <AppRoutes />
          <StorageToast />
        </BrowserRouter>
      </AppProvider>
    </ErrorBoundary>
  )
}
