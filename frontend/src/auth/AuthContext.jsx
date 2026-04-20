import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('hmd_user')
    return saved ? JSON.parse(saved) : null
  })

  useEffect(() => {
    if (user) localStorage.setItem('hmd_user', JSON.stringify(user))
    else localStorage.removeItem('hmd_user')
  }, [user])

  const login = (userData) => setUser(userData)

  const logout = () => {
    setUser(null)
    localStorage.removeItem('hmd_user')
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
