import { useEffect } from 'react'

/** Set the browser tab title for a page ("New game · Open Dam"). */
export function usePageTitle(title: string | null) {
  useEffect(() => {
    document.title = title ? `${title} · Open Dam` : 'Open Dam'
  }, [title])
}
