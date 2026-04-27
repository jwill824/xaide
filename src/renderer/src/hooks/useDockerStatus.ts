import { useState, useEffect } from 'react'

export function useDockerStatus(): { available: boolean; loading: boolean } {
  const [available, setAvailable] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.xaide.sandbox
      .available()
      .then((result) => setAvailable(result))
      .catch(() => setAvailable(false))
      .finally(() => setLoading(false))
  }, [])

  return { available, loading }
}
