import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // VELOCITY palette - see DESIGN.md for the full token system.
        // Always reference these via CSS variables in components, not raw hex,
        // so we can theme/skin without hunting for usages.
        ink: {
          DEFAULT: 'var(--nn-ink)',           // #0A0A0A page background
          shadow: 'var(--nn-ink-shadow)',     // #141414 surface 1 - cards
          panel: 'var(--nn-ink-panel)',       // #1C1C1C surface 2 - elevated
          line: 'var(--nn-ink-line)',         // #2A2A2A subtle borders
          'line-bold': 'var(--nn-ink-line-bold)', // #3A3A3A active borders
        },
        bone: {
          DEFAULT: 'var(--nn-bone)',          // #F5F5F0 primary text
          dim: 'var(--nn-bone-dim)',          // #A5A5A0 secondary text
          mute: 'var(--nn-bone-mute)',        // #6E6E6A tertiary text
        },
        accent: {
          DEFAULT: 'var(--nn-accent)',          // #FF5F00 VELOCITY orange
          hover: 'var(--nn-accent-hover)',      // #FF7A2B hover state
          glow: 'var(--nn-accent-glow)',        // rgba 18% inner glow
          faint: 'var(--nn-accent-faint)',      // rgba 8% subtle tint
        },
        signal: {
          ok: 'var(--nn-signal-ok)',          // #26D0AE teal stable/optimal
          warn: 'var(--nn-signal-warn)',      // #EAB308 amber caution
          miss: 'var(--nn-signal-miss)',      // #DC2626 red alert
        },
        matrix: {
          long: 'var(--nn-matrix-long)',           // long runs in matrix
          strength: 'var(--nn-matrix-strength)',   // cross/strength sessions
        },
        // Kiero layer (kiero-1) - additive, Patrol + bottom nav only. See
        // app/globals.css for the token doc; nothing here touches --nn-*.
        'k-accent': {
          DEFAULT: 'var(--k-accent)',
          hover: 'var(--k-accent-hover)',
          glow: 'var(--k-accent-glow)',
        },
        'k-ring': {
          form: 'var(--k-ring-form)',
          load: 'var(--k-ring-load)',
          compliance: 'var(--k-ring-compliance)',
        },
        'k-data': {
          teal: 'var(--k-data-teal)',
          purple: 'var(--k-data-purple)',
          pink: 'var(--k-data-pink)',
          green: 'var(--k-data-green)',
          amber: 'var(--k-data-amber)',
        },
        // shadcn/ui theme layer (kiero-2) - namespaced `sh` rather than the
        // classic bare background/primary/accent/etc keys, because those
        // collide with the app-wide `accent` key above and (for radius) the
        // rounded-lg/md/sm/xl scale in borderRadius below. See app/globals.css
        // for the --sh-* CSS var values and the Kiero-colour mapping doc.
        sh: {
          background: 'hsl(var(--sh-background))',
          foreground: 'hsl(var(--sh-foreground))',
          card: 'hsl(var(--sh-card))',
          'card-foreground': 'hsl(var(--sh-card-foreground))',
          popover: 'hsl(var(--sh-popover))',
          'popover-foreground': 'hsl(var(--sh-popover-foreground))',
          primary: 'hsl(var(--sh-primary))',
          'primary-foreground': 'hsl(var(--sh-primary-foreground))',
          secondary: 'hsl(var(--sh-secondary))',
          'secondary-foreground': 'hsl(var(--sh-secondary-foreground))',
          muted: 'hsl(var(--sh-muted))',
          'muted-foreground': 'hsl(var(--sh-muted-foreground))',
          accent: 'hsl(var(--sh-accent))',
          'accent-foreground': 'hsl(var(--sh-accent-foreground))',
          destructive: 'hsl(var(--sh-destructive))',
          'destructive-foreground': 'hsl(var(--sh-destructive-foreground))',
          border: 'hsl(var(--sh-border))',
          input: 'hsl(var(--sh-input))',
          ring: 'hsl(var(--sh-ring))',
        },
      },
      fontFamily: {
        // Bebas Neue - display & wordmark.
        // IBM Plex Sans - body & UI.
        // JetBrains Mono - paces, distances, times. Tabular figures.
        display: ['var(--font-bebas)', 'sans-serif'],
        sans: ['var(--font-plex)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'ui-monospace', 'monospace'],
      },
      letterSpacing: {
        // Bebas needs more tracking at small sizes
        'wide-display': '0.04em',
        'wider-display': '0.08em',
      },
      borderRadius: {
        // VELOCITY uses soft-rounded surfaces. The previous brutalist
        // 2px-max rule is retired.
        //
        // Redesign spec §1.3 (one notch tighter, still rounded — not a
        // return to the 2px-brutalist rule): card/button/input 12px->10px,
        // pill/chip 8px->6px, hero panel/modal 16px->14px. Token-only edit —
        // class names (rounded-lg/xl/2xl/md) are unchanged so existing
        // markup keeps working; only the underlying px values moved.
        none: '0',
        sm: '4px',
        DEFAULT: '6px',
        md: '6px',      // pills, chips
        lg: '10px',     // buttons, inputs
        xl: '10px',     // cards
        '2xl': '14px',  // hero panels, modals
        full: '9999px', // circles only (avatars, dots)
        // shadcn/ui theme layer (kiero-2) - separate namespace from the
        // scale above so shadcn's own rounded-md/lg/xl references (renamed
        // to sh-md/sh-lg/sh-xl in components/shadcn/*) don't collide with
        // or repaint the existing app-wide rounded-lg/md/xl values.
        'sh-sm': 'calc(var(--sh-radius) - 8px)',
        'sh-md': 'calc(var(--sh-radius) - 4px)',
        'sh-lg': 'var(--sh-radius)',
        'sh-xl': 'calc(var(--sh-radius) + 4px)',
      },
      boxShadow: {
        // Subtle layered depth for cards. Avoid harsh shadows.
        card: '0 1px 2px 0 rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(0, 0, 0, 0.1)',
        'card-elevated': '0 4px 12px 0 rgba(0, 0, 0, 0.5)',
        // Active card inner glow
        'accent-inset': 'inset 0 0 24px 0 var(--nn-accent-glow)',
        // Active border ring
        'accent-ring': '0 0 0 1px var(--nn-accent)',
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out',
        'slide-up': 'slide-up 240ms ease-out',
        'pulse-subtle': 'pulse-subtle 1.6s ease-in-out infinite',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-subtle': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.65' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
