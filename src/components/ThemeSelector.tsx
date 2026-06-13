import { useTheme } from '../context/ThemeContext'
import { Palette } from 'lucide-react'

export default function ThemeSelector() {
  const { currentTheme, setTheme, allThemes } = useTheme()

  return (
    <div className="flex items-center gap-2">
      <Palette size={16} style={{ color: '#e5e5e5' }} />
      <select
        value={currentTheme}
        onChange={(e) => setTheme(e.target.value as keyof typeof allThemes)}
        className="px-2 py-1 text-sm rounded cursor-pointer"
        style={{
          backgroundColor: '#262626',
          color: '#e5e5e5',
          border: '1px solid #404040',
        }}
      >
        {Object.entries(allThemes).map(([key, theme]) => (
          <option key={key} value={key}>
            {theme.name}
          </option>
        ))}
      </select>
    </div>
  )
}
