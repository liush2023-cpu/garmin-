# 佳明小工具 Design System

A comprehensive design system for **佳明小工具** (Garmin AI Training Coach) — an intelligent training plan parser and Garmin synchronizer for endurance athletes.

## Overview

This design system provides design foundations, reusable components, and UI kits for building interfaces that help athletes import AI-generated training plans, preview workouts, and sync them directly to Garmin Connect.

**Key Products:**
- **Training Plan Parser**: Import natural language or JSON training plans, parse with AI, edit workouts
- **Workout Manager**: Timeline-based interface for reviewing and confirming planned workouts
- **Garmin Sync**: One-click synchronization to Garmin Connect with status tracking

## Design Philosophy

佳明小工具 emphasizes **clarity over complexity** for data-intensive sports analytics interfaces. The design language combines:

- **Premium SaaS aesthetics** — clean, minimal, high-information-density layouts
- **Endurance sports DNA** — inspired by Garmin Connect, Strava, TrainingPeaks
- **Data visualization first** — workout profiles, metrics, trends, and performance indicators
- **Light theme with professional blue** — trustworthy, technical, performance-oriented

## Foundations

### Color System

**Primary Brand:** Blue (`#2563EB`) — primary actions, highlights, primary elements  
**Secondary Accent:** Orange (`#E8590C`) — secondary actions, emphasis  
**Semantic Signals:** Success (`#16A34A`), Warning (`#D97706`), Error (`#DC2626`), Info (`#3B82F6`)

**Training Type Colors:**
- Easy / Recovery: Green (`#16A34A`)
- Aerobic: Blue (`#2563EB`)
- Threshold / Speed: Red (`#DC2626`)
- Long Distance: Purple (`#7C3AED`)
- Strength: Gray (`#334155`)
- Rest: Light Gray (`#94A3B8`)

**Surfaces:**
- Primary Background: `#F6F8FB` (light, neutral)
- Surface: `#FFFFFF` (cards, panels)
- Subtle: `#F1F4F8` (hover states)
- Text: Primary `#0F172A`, Secondary `#334155`, Tertiary `#64748B`, Quaternary `#94A3B8`

### Typography

**Font Family:** System fonts (`-apple-system`, `BlinkMacSystemFont`, `Inter`, `Segoe UI`)  
**Display:** 40px Bold (headings)  
**Body:** 13–14px Regular (content)  
**Small:** 12px Regular (labels, secondary)  
**Micro:** 11px Regular (UI hints, micro-text)

**Weights:** Regular (400), Medium (500), Semibold (600), Bold (700)

### Spacing

Base scale: 4px increments (4, 8, 12, 16, 20, 24, 32, 48px)  
Border Radius: 4px (xs), 6px (sm), 10px (md), 12px (lg)  
Shadows: Subtle to Medium elevation system

### Layout Patterns

**3-Column App Layout:**
- **Left Panel:** Input/source (training plan paste, file upload)
- **Center Panel:** Timeline (workout list, editable items)
- **Right Panel:** Output/actions (Garmin account, sync status, metrics)

**Header:** Fixed, 60px height, branded logo + status indicators  
**Responsive:** Stacks to single column on mobile; tabs for section switching

## Content Fundamentals

**Brand Voice:** Professional, knowledgeable, approachable — like an experienced endurance coach  
**Tone Examples:**
- "Your training load is increasing steadily and remains within a healthy range."
- "Recovery indicators suggest an easy training day may improve long-term performance."
- "VO2Max has improved by 3.2% over the past eight weeks."

**Key Principles:**
- Avoid marketing buzzwords; focus on actionable insights
- Communicate complex data in clear, understandable language
- Use numerical data prominently (metrics, timestamps, distances)
- Practical, supportive language that empowers athletes

**No emoji usage** — maintain professional, technical tone

## Visual Foundations

**Backgrounds:**
- Light, neutral palette with high contrast for legibility
- Full-bleed imagery avoided; focus on data visualization
- Subtle gradients used sparingly (none visible currently)

**Animation:**
- Fast, snappy transitions (0.12s for UI, 0.2s for larger changes)
- Easing: cubic-bezier(0.4, 0, 0.2, 1) for ease-out effects
- No infinite decorative loops on data interfaces

**Hover States:** Subtle background color shifts, not opacity changes  
**Focus States:** 2px outline with primary color, 2px offset  
**Borders:** Thin (1px), subtle gray (`#E2E8F0`)  
**Cards:** Soft shadow + light border, rounded corners (6–10px)  
**Icons:** Not yet defined; uses HTML entities or system icons (e.g., ✓, ⚠, ✕)

## Components

**Primitives:**
- `Button` — primary/secondary/ghost/danger variants, sizes (sm/md/lg)
- `Card` — elevation levels, padding options
- `Badge` — semantic color variants (success/warning/error/primary/secondary)
- `Input` — text field with focus states
- `Select` / `Textarea` — form fields (planned)

**Feedback:**
- Status badges (connected/disconnected/warning)
- Inline validation messages
- Toast/notification system (planned)

**Data Display:**
- Workout profile bars (stacked color segments for workout structure)
- Metric cards (KPI displays)
- Timeline cards (workout items with editable state)

## UI Kits

**Training Interface** (`ui_kits/training/`)
- Dashboard: Overview of weekly volume, planned workouts, sync status
- Workout Editor: Inline editing for title, date, sport type, steps
- Sync Panel: Account connection, pre-sync validation, completion status

## Tokens

All design tokens are defined as CSS custom properties in `tokens/`:
- `colors.css` — color palette
- `typography.css` — font sizes, weights, line heights
- `spacing.css` — spacing scale, border radius, z-index
- `shadows.css` — elevation system

Import via `styles.css` (root entry point).

## Usage

### For Design Teams
1. Review the foundation cards in the Design System tab (colors, typography, spacing)
2. Check UI kit implementations in `ui_kits/training/` for layout patterns
3. Use component specs in `components/` as reference when building new screens

### For Developers
1. Import global styles: `<link rel="stylesheet" href="path/to/styles.css">`
2. Use components from the bundle (accessible via `window.GarminUI.*`)
3. Reference token values in CSS: `var(--color-primary)`, `var(--space-8)`, etc.

## Resources

**Source Codebase:** https://github.com/liush2023-cpu/garmin-  
**Key Files:**
- Client styles: `client/src/App.css`, `client/src/index.css`
- Components: `client/src/components/` (React implementations)
- Types: `client/src/types.ts`

## Caveats & Next Steps

⚠️ **Icon System:** The design system currently references HTML entities and system icons. For production, integrate a dedicated icon library (e.g., Lucide, Heroicons, or custom SVG set) and document icon usage.

⚠️ **Chart Components:** Data visualization for VO2Max trends, training load curves, and recovery metrics are referenced but not yet implemented as reusable components. Add specialized chart/graph components for analytics views.

⚠️ **Mobile Responsiveness:** Responsive breakpoints and mobile-specific layouts (touch targets, stacking) are defined in App.css but not yet formalized in the token system. Extend spacing tokens with mobile-specific scales if building mobile-first variants.

⚠️ **Accessibility:** Focus states and ARIA labels are partially implemented. Audit and extend accessibility coverage (keyboard navigation, screen reader support, color contrast).

⚠️ **Dark Mode:** The current system uses a light theme. Dark mode support can be added via CSS custom properties with a prefers-color-scheme media query.

**Next Priorities:**
1. Add form field components (Select, Textarea, Checkbox, Radio)
2. Create data visualization components (charts, graphs, sparklines)
3. Document icon usage and integrate icon library
4. Extend UI kit with Garmin sync and account management flows
5. Add comprehensive Storybook or component documentation site

---

**Design System Version:** 1.0  
**Last Updated:** June 9, 2026
