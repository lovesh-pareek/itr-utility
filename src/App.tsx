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
// v2 screens (stubs — built in Wave 15)
import { S05Deductions }       from './screens/S05Deductions'
import { S06RegimeComparison } from './screens/S06RegimeComparison'
import { S07AISValidation }    from './screens/S07AISValidation'
import { S12BankAccounts }     from './screens/S12BankAccounts'
import { S13ScheduleAL }       from './screens/S13ScheduleAL'

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
        <Route path="/review/deductions"    element={<S05Deductions />} />
        <Route path="/review/regime"         element={<S06RegimeComparison />} />
        <Route path="/review/ais"            element={<S07AISValidation />} />
        <Route path="/review/bank-accounts"  element={<S12BankAccounts />} />
        <Route path="/review/schedule-al"    element={<S13ScheduleAL />} />
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
