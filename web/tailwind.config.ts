import type { Config } from 'tailwindcss'

const brandSlate = {
  950: '#060D18',
  900: '#0A1321',
  800: '#0F1E31',
  700: '#162B3F',
  600: '#1E3550',
  500: '#4D6F8A',
  400: '#6B8EA8',
  300: '#94B3CA',
  200: '#BFCFDD',
  100: '#E0EEF8',
}

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        slate: brandSlate,
        accent: {
          DEFAULT: '#E8B84B',
          fg: '#060D18',
          glow: 'rgba(232,184,75,0.25)',
        },
        cyan: {
          DEFAULT: '#00D4FF',
          glow: 'rgba(0,212,255,0.2)',
        },
        'wc-navy': '#0C1D3E',
        'wc-red': '#DC2430',
        'pitch-green': '#2D7A4F',
        brand: {
          dark: '#0A1321',
        },
        fdr: {
          1: '#00c264',
          2: '#01fc7a',
          3: '#5a5a5a',
          4: '#ff1751',
          5: '#80072d',
        },
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        shimmer: 'shimmer 2.5s linear infinite',
        scan: 'scan 6s linear infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(200px)' },
        },
      },
      boxShadow: {
        'glow-gold': '0 0 20px rgba(232,184,75,0.15), 0 0 40px rgba(232,184,75,0.05)',
        'glow-cyan': '0 0 20px rgba(0,212,255,0.15), 0 0 40px rgba(0,212,255,0.05)',
        'glow-gold-md': '0 0 16px rgba(232,184,75,0.35)',
        'glow-cyan-md': '0 0 16px rgba(0,212,255,0.3)',
        'glow-green-md': '0 0 16px rgba(74,222,128,0.2)',
        card: '0 4px 24px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)',
      },
    },
  },
  plugins: [],
} satisfies Config
