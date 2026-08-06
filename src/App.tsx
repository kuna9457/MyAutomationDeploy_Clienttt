import { Navigate, Route, Routes } from "react-router-dom"
import { useAuth } from "./lib/auth"
import LoginPage from "./pages/LoginPage"
import BrokerCallbackPage from "./pages/BrokerCallbackPage"
import DashboardPage from "./pages/DashboardPage"
import ClientDashboardPage from "./pages/ClientDashboardPage"

function RequireAuth({ children }: { children: React.ReactElement }) {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return children
}

function RoleHome() {
  const { role } = useAuth()
  return role === "admin" ? <DashboardPage /> : <ClientDashboardPage />
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/*
        Deliberately OUTSIDE RequireAuth. The broker appends a one-time
        authorization code to this URL; bouncing a signed-out visitor to
        /login would drop the query string and destroy it. The page renders
        either way and handles the signed-out case itself.
      */}
      <Route path="/broker/callback" element={<BrokerCallbackPage />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <RoleHome />
          </RequireAuth>
        }
      />
    </Routes>
  )
}

export default App
