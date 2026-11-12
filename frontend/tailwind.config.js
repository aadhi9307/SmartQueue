/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          900: "#0A0F1D",
          850: "#0F172A",
          800: "#1E293B",
          700: "#334155"
        },
        indigo: {
          500: "#6366F1",
          600: "#4F46E5",
          700: "#4338CA"
        },
        emerald: {
          500: "#10B981",
          600: "#059669",
          700: "#047857"
        },
        amber: {
          500: "#F59E0B",
          600: "#D97706",
          700: "#B45309"
        }
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-subtle': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'badge-flash': 'badgeFlash 2s ease-in-out infinite',
      },
      keyframes: {
        badgeFlash: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.85', transform: 'scale(1.02)' },
        }
      }
    },
  },
  plugins: [],
}
