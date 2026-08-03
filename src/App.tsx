import { Navigate, Route, Routes } from "react-router-dom"
import { useAuth } from "./lib/auth"
import LoginPage from "./pages/LoginPage"
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
