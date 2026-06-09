---
name: garmin-ui-design
description: Design system for 佳明小工具 (Garmin AI Training Coach). Contains design foundations (colors, typography, spacing), reusable UI components (Button, Card, Badge, Input), and UI kit screens for training plan import, workout management, and Garmin synchronization. Built for high-density data interfaces with a professional, technical aesthetic inspired by endurance sports platforms.
user-invocable: true
---

# 佳明小工具 Design System

Read the **README.md** file in the root of this design system for a complete overview of the brand, design philosophy, color system, typography, and layout patterns.

## Quick Start

### For Designers

Explore the **Design System** tab to see:
- **Colors** — brand palette, semantic signals, training type colors
- **Typography** — size scales, weights, line heights
- **Spacing** — spacing scale, border radius, shadows
- **Components** — Button, Card, Badge, Input components in context
- **Training** — UI kit screens for the training plan interface

### For Developers

1. **Copy the styles:** Import `styles.css` from this design system into your project. It automatically loads all tokens (colors, typography, spacing, shadows).

2. **Use components:** The design system exports reusable React components:
   ```jsx
   import { Button, Card, Badge, Input } from 'garmin-ui';
   
   <Button variant="primary" size="md">Sync to Garmin</Button>
   <Card elevation="md">
     <Badge variant="success">✓ Connected</Badge>
   </Card>
   ```

3. **Reference tokens in CSS:**
   ```css
   .my-element {
     color: var(--color-text-primary);
     background: var(--color-bg-secondary);
     padding: var(--space-8);
     border-radius: var(--radius-md);
     box-shadow: var(--shadow-md);
   }
   ```

4. **Responsive design:** Use the 3-column layout pattern (left input panel, center timeline, right output panel) for data-heavy interfaces. The layout stacks on mobile via media queries.

## Key Design Patterns

### Color Usage
- **Primary Blue** (`#2563EB`) — CTAs, highlights, links
- **Secondary Orange** (`#E8590C`) — secondary actions, emphasis
- **Training Colors** — Green (easy), Blue (aerobic), Red (threshold), Purple (LSD)
- **Semantic** — Success (green), Warning (yellow), Error (red), Info (blue)

### Typography
- **Display:** 40px Bold for section headings
- **Heading:** 28px Semibold for subsections
- **Body:** 13–14px Regular for content
- **Label:** 11px Uppercase for UI labels and hints
- Use `font-variant-numeric: tabular-nums` for aligned data tables

### Spacing
- **4px** base unit; use increments (8px, 12px, 16px, 24px, 32px)
- **Padding:** 8–16px inside cards
- **Gap:** 8–12px between sibling elements
- **Radius:** 6px (buttons, inputs), 10px (cards), 4px (small elements)

### Components
All components are responsive and support variants:
- **Button:** `primary` | `secondary` | `ghost` | `danger`, sizes `sm` | `md` | `lg`
- **Card:** `elevation` levels (xs/sm/md/lg), `padding` options (sm/md/lg)
- **Badge:** `variant` (primary/success/warning/error/secondary), `size` (sm/md/lg)
- **Input:** `size` (sm/md/lg), standard HTML attributes

### Workout Visualization
- **Profile bars:** Stacked horizontal bar showing workout structure (warmup, interval, recovery, etc.)
- **Colors:** warmup (blue), interval (red), recovery (green), easy (green), rest (gray)
- **Metrics:** KPI cards displaying weekly volume, training load, planned workouts

## File Structure

```
├── styles.css                 # Root entry point (imports all tokens)
├── tokens/
│   ├── colors.css            # Color palette
│   ├── typography.css        # Font scale, weights, utilities
│   ├── spacing.css           # Spacing, radius, z-index
│   └── shadows.css           # Shadow elevation system
├── foundation/
│   ├── colors.html           # Color palette specimen card
│   ├── typography.html       # Typography specimen card
│   └── spacing.html          # Spacing scale specimen card
├── components/
│   ├── Button.jsx            # Button component
│   ├── Button.d.ts           # Props interface
│   ├── Card.jsx              # Card component
│   ├── Card.d.ts             # Props interface
│   ├── Badge.jsx             # Badge component
│   ├── Badge.d.ts            # Props interface
│   ├── Input.jsx             # Input component
│   ├── Input.d.ts            # Props interface
│   └── components.card.html  # Component reference card
├── ui_kits/
│   └── training/
│       ├── index.html        # Main dashboard (3-column layout)
│       └── dashboard.html    # Dashboard view card
└── README.md                 # Full design guide & documentation
```

## Brand Voice & Tone

Communicate like an **experienced endurance coach** — knowledgeable, practical, supportive:

✓ "Your training load is increasing steadily and remains within a healthy range."  
✓ "Recovery indicators suggest an easy training day may improve long-term performance."  
✓ "VO2Max has improved by 3.2% over the past eight weeks."

✗ Avoid marketing speak, emojis (except in technical contexts), overly casual language

## Content Guidance

- **Use data prominently** — metrics, timestamps, distances first
- **Be actionable** — explain implications, not just numbers
- **Avoid jargon** — define technical terms for casual users
- **Support athlete autonomy** — offer insights, not commands

## Next Steps for This Project

If you're building with this design system:

1. **Set up token references** — all colors/spacing/shadows available as CSS custom properties
2. **Extend components** — add Form (Select, Textarea, Checkbox), Modals, Drawers as needed
3. **Build screens** — use the 3-column layout pattern for data-intensive interfaces
4. **Test responsiveness** — ensure mobile stacking and touch targets (44px minimum)
5. **Add icons** — integrate a dedicated icon library (Lucide, Heroicons, etc.)
6. **Document** — create a Storybook or component site for team reference

## Questions?

- **Design decisions:** See README.md for visual foundations, color rationale, and design philosophy
- **Component props:** Check the `.d.ts` files for TypeScript interfaces
- **Inspiration:** Visit the UI kit screens to see patterns in context

---

**Ready to build with 佳明小工具?** Start with the tokens, pick components from the library, and follow the layout patterns shown in the training UI kit. Happy designing! 🏃‍♂️
