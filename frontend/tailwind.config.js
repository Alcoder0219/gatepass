/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Semantic tokens — driven by CSS variables so light/dark is a single
        // source of truth (see index.css). Components never hardcode a hex.
        surface: {
          DEFAULT: 'rgb(var(--surface) / <alpha-value>)',
          raised: 'rgb(var(--surface-raised) / <alpha-value>)',
          sunken: 'rgb(var(--surface-sunken) / <alpha-value>)',
        },
        content: {
          DEFAULT: 'rgb(var(--content) / <alpha-value>)',
          muted: 'rgb(var(--content-muted) / <alpha-value>)',
          subtle: 'rgb(var(--content-subtle) / <alpha-value>)',
        },
        line: 'rgb(var(--line) / <alpha-value>)',

        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#1e1b4b',
        },
        accent: {
          50: '#ecfeff',
          100: '#cffafe',
          200: '#a5f3fc',
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
          800: '#155e75',
          900: '#164e63',
        },
        success: { 50: '#ecfdf5', 100: '#d1fae5', 400: '#34d399', 500: '#10b981', 600: '#059669', 700: '#047857' },
        warning: { 50: '#fffbeb', 100: '#fef3c7', 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706', 700: '#b45309' },
        danger: { 50: '#fef2f2', 100: '#fee2e2', 400: '#f87171', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c' },
        info: { 50: '#eff6ff', 100: '#dbeafe', 400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8' },
      },

      fontFamily: {
        sans: ['Inter var', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },

      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },

      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },

      boxShadow: {
        glass: '0 8px 32px -8px rgb(15 23 42 / 0.12), 0 2px 8px -2px rgb(15 23 42 / 0.06)',
        'glass-lg': '0 24px 64px -16px rgb(15 23 42 / 0.2), 0 8px 24px -8px rgb(15 23 42 / 0.1)',
        glow: '0 0 0 1px rgb(99 102 241 / 0.2), 0 8px 32px -8px rgb(99 102 241 / 0.4)',
        'glow-sm': '0 0 16px -4px rgb(99 102 241 / 0.5)',
        inner_top: 'inset 0 1px 0 0 rgb(255 255 255 / 0.06)',
      },

      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #06b6d4 100%)',
        'brand-gradient-soft': 'linear-gradient(135deg, rgb(99 102 241 / 0.12), rgb(6 182 212 / 0.12))',
        mesh: 'radial-gradient(at 20% 0%, rgb(99 102 241 / 0.18) 0px, transparent 50%), radial-gradient(at 85% 10%, rgb(6 182 212 / 0.14) 0px, transparent 50%), radial-gradient(at 50% 90%, rgb(139 92 246 / 0.12) 0px, transparent 50%)',
        shimmer: 'linear-gradient(90deg, transparent, rgb(255 255 255 / 0.08), transparent)',
      },

      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.7' },
          '80%, 100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        'gradient-pan': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
      },

      animation: {
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-up': 'slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        shimmer: 'shimmer 1.8s infinite',
        float: 'float 4s ease-in-out infinite',
        'pulse-ring': 'pulse-ring 1.8s cubic-bezier(0.24, 0, 0.38, 1) infinite',
        'gradient-pan': 'gradient-pan 6s ease infinite',
      },

      transitionTimingFunction: {
        spring: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};
