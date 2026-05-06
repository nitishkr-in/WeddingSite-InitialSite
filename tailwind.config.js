/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        crimson: {
          DEFAULT: '#c0282e',
          50: '#fbeaea',
          100: '#f5c9cb',
          200: '#eb9396',
          300: '#df5d62',
          400: '#d13a40',
          500: '#c0282e',
          600: '#9c2026',
          700: '#75181c',
          800: '#4e1013',
          900: '#2a0809',
        },
        gold: {
          DEFAULT: '#d4a040',
          50: '#fcf5e5',
          100: '#f7e6bb',
          200: '#eecf7f',
          300: '#e3b85a',
          400: '#daaa48',
          500: '#d4a040',
          600: '#ac8233',
          700: '#826226',
          800: '#57411a',
          900: '#2d210d',
        },
        ivory: {
          DEFAULT: '#fff8e8',
          50: '#fffef9',
          100: '#fffcf0',
          200: '#fff8e8',
          300: '#fff1cf',
          400: '#ffe8b0',
          500: '#ffdc8a',
        },
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        body: ['"Cormorant Garamond"', 'Georgia', 'serif'],
      },
      fontSize: {
        'hero': ['clamp(3rem, 10vw, 8rem)', { lineHeight: '1.05', letterSpacing: '-0.02em' }],
        'display': ['clamp(2rem, 5vw, 4rem)', { lineHeight: '1.1', letterSpacing: '-0.01em' }],
      },
      animation: {
        'flicker': 'flicker 1.8s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
        'shimmer': 'shimmer 3s linear infinite',
      },
      keyframes: {
        flicker: {
          '0%, 100%': { opacity: '1', transform: 'scaleY(1)' },
          '50%': { opacity: '0.85', transform: 'scaleY(1.05)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0) rotate(0deg)' },
          '50%': { transform: 'translateY(-12px) rotate(3deg)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
}
