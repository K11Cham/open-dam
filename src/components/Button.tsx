import { type ReactNode } from 'react'
import { useTheme } from '../context/ThemeContext'

interface ButtonProps {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  className?: string
  style?: React.CSSProperties
}

export default function Button({
  children,
  onClick,
  disabled = false,
  className = '',
  style,
}: ButtonProps) {
  const { theme } = useTheme()

  const buttonStyle: React.CSSProperties = {
    ...style,
    transition: 'background-color 0.18s ease, color 0.18s ease, border-color 0.18s ease, transform 0.12s ease',
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center px-4 py-2 rounded-2xl text-sm font-medium cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 ${className}`}
      style={buttonStyle}
    >
      {children}
    </button>
  )
}