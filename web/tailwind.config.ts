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
          DEFAULT: '#E8B84B',  // WC gold
          fg: '#060D18',
        },
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
    },
  },
  plugins: [],
} satisfies Config
