# T-POS Design System - MASTER

## 1. Spacing Scale (8px base)

```
xs: 4px    (0.25rem)
sm: 8px    (0.5rem)
md: 12px   (0.75rem)
lg: 16px   (1rem)
xl: 20px   (1.25rem)
2xl: 24px  (1.5rem)
3xl: 32px  (2rem)
4xl: 40px  (2.5rem)
5xl: 48px  (3rem)
```

**Usage:**
- Padding: `p-sm`, `p-md`, `p-lg`, `p-xl`, `p-2xl`
- Margin: `m-sm`, `m-md`, `m-lg`, `m-xl`, `m-2xl`
- Gap: `gap-sm`, `gap-md`, `gap-lg`, `gap-xl`, `gap-2xl`

---

## 2. Touch Target Sizes (Mobile First)

| Size | Dimensions | Use Case |
|------|-----------|----------|
| **sm** | 36x36px | Icon-only, secondary actions |
| **md** | 44x44px | Primary buttons, inputs (WCAG minimum) |
| **lg** | 48x48px | FAB, prominent actions |
| **xl** | 56x56px | Large FAB, hero buttons |

**Rule:** All interactive elements ≥ 44x44px on mobile

---

## 3. Glass Effect System

### Blur Values
```
glass-sm:   blur(8px)
glass-md:   blur(12px)
glass-lg:   blur(16px)
glass-xl:   blur(24px)
glass-2xl:  blur(32px)
```

### Opacity Levels
```
glass-10:   rgba(255, 255, 255, 0.04)   // Subtle
glass-15:   rgba(255, 255, 255, 0.06)   // Light
glass-20:   rgba(255, 255, 255, 0.08)   // Medium
glass-30:   rgba(255, 255, 255, 0.12)   // Strong
glass-40:   rgba(255, 255, 255, 0.16)   // Very Strong
```

### Border Colors
```
border-10:  rgba(255, 255, 255, 0.08)   // Subtle
border-15:  rgba(255, 255, 255, 0.12)   // Light
border-20:  rgba(255, 255, 255, 0.18)   // Medium
```

### Shadows
```
shadow-card:        0 2px 12px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.05)
shadow-card-hover:  0 4px 24px rgba(0, 0, 0, 0.3), 0 0 16px rgba(139, 92, 246, 0.08)
shadow-nav:         0 -4px 30px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.06)
shadow-button:      0 4px 16px rgba(139, 92, 246, 0.3), 0 0 40px rgba(139, 92, 246, 0.1)
```

---

## 4. Component Sizes

### Button
```
sm:  h-9 px-3 text-xs
md:  h-11 px-4 text-sm
lg:  h-12 px-5 text-base
xl:  h-14 px-6 text-lg
```

### Input
```
sm:  h-9 px-3 text-xs
md:  h-11 px-4 text-sm
lg:  h-12 px-5 text-base
```

### Card
```
radius-sm:  rounded-xl (0.75rem)
radius-md:  rounded-2xl (1.25rem)
radius-lg:  rounded-3xl (1.5rem)
```

---

## 5. Responsive Breakpoints

```
Mobile:   < 375px   (default)
sm:       375px     (small phones)
md:       768px     (tablets)
lg:       1024px    (small laptops)
xl:       1440px    (desktops)
2xl:      1920px    (large screens)
```

**Mobile-First Approach:**
1. Default styles for mobile (< 375px)
2. `sm:` for 375px+
3. `md:` for 768px+ (tablets)
4. `lg:` for 1024px+ (desktops)
5. `xl:` for 1440px+ (large desktops)

---

## 6. Typography

### Font Family
```
--font-body: 'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif
--font-mono: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace
```

### Font Sizes
```
xs:   12px (0.75rem)
sm:   14px (0.875rem)
base: 16px (1rem)
lg:   18px (1.125rem)
xl:   20px (1.25rem)
2xl:  24px (1.5rem)
3xl:  30px (1.875rem)
4xl:  36px (2.25rem)
```

### Font Weights
```
regular:  400
medium:   500
semibold: 600
bold:     700
black:    900
```

### Line Heights
```
tight:   1.25
normal:  1.5
relaxed: 1.75
```

---

## 7. Color Palette

### Primary Colors
```
--c-bg:              #0a0e1a
--c-bg2:             #111827
--c-text:            #f1f5f9
--c-hint:            #94a3b8
--c-muted:           rgba(148, 163, 184, 0.4)
```

### Accent (Purple → Cyan)
```
--c-accent:          #8b5cf6
--c-accent-light:    #a78bfa
--c-accent-text:     #ffffff
--c-accent-glow:     rgba(139, 92, 246, 0.25)
--c-accent-rgb:      139, 92, 246
--c-accent-gradient: linear-gradient(135deg, #8b5cf6, #06b6d4)
```

### Semantic
```
--c-success:         #34d399
--c-success-bg:      rgba(52, 211, 153, 0.08)
--c-success-border:  rgba(52, 211, 153, 0.18)

--c-danger:          #fb7185
--c-danger-bg:       rgba(251, 113, 133, 0.08)
--c-danger-border:   rgba(251, 113, 133, 0.18)

--c-warning:         #fbbf24
--c-warning-bg:      rgba(251, 191, 36, 0.08)
--c-warning-border:  rgba(251, 191, 36, 0.18)

--c-info:            #60a5fa
--c-info-bg:         rgba(96, 165, 250, 0.08)
--c-info-border:     rgba(96, 165, 250, 0.18)
```

---

## 8. Animation System

### Durations
```
fast:     150ms
normal:   200ms
slow:     300ms
slower:   400ms
slowest:  600ms
```

### Easing Functions
```
--ease-out-expo:  cubic-bezier(0.16, 1, 0.3, 1)
--ease-spring:    cubic-bezier(0.22, 1, 0.36, 1)
--ease-in-out:    cubic-bezier(0.4, 0, 0.2, 1)
```

### Standard Animations
```
fade-in:        opacity 0.1s ease-out
fade-in-up:     opacity + translateY 0.15s ease-spring
slide-up:       translateY 0.3s ease-spring
slide-down:     translateY 0.2s ease-spring
slide-in-right: translateX + opacity 0.2s ease-spring
slide-in-left:  translateX + opacity 0.2s ease-spring
pop-in:         scale + opacity 0.2s ease-spring
```

---

## 9. Z-Index Scale

```
0:   default
10:  dropdown, tooltip
20:  modal backdrop
30:  modal, drawer
40:  header, nav
50:  floating action button
60:  payment panel, bottom nav
70:  notification, alert
```

---

## 10. Component Guidelines

### Button
- **Minimum size:** 44x44px (md size)
- **Padding:** Horizontal ≥ 16px, Vertical ≥ 12px
- **Gap between buttons:** ≥ 8px
- **Focus state:** Visible ring (2px, accent color)
- **Disabled:** opacity-50, cursor-not-allowed
- **Active state:** scale(0.96) or scale(0.975)

### Input
- **Minimum height:** 44px (md size)
- **Padding:** 12px horizontal, 10px vertical
- **Focus state:** 3px ring, accent color
- **Placeholder:** --c-hint color
- **Error state:** --c-danger border + bg
- **Label:** 11px, uppercase, tracking-wider

### Card
- **Padding:** 16px (lg) or 20px (xl)
- **Border radius:** 20px (md) or 24px (lg)
- **Glass effect:** blur-md, glass-20 opacity, border-15
- **Shadow:** shadow-card
- **Hover:** scale(1.02), shadow-card-hover

### Drawer
- **Width:** 90vw max-w-sm (mobile), max-w-md (tablet)
- **Border radius:** 24px (top on mobile, all on desktop)
- **Glass effect:** blur-2xl, glass-30 opacity
- **Animation:** slide-up 0.3s ease-spring
- **Padding:** 20px (lg)

### Navigation
- **Height:** 56px (mobile), 64px (desktop)
- **Glass effect:** blur-lg, glass-30 opacity
- **Border:** border-15
- **Shadow:** shadow-nav
- **Safe area:** padding-top: var(--safe-top)

---

## 11. Responsive Rules

### Mobile (< 375px)
- Font size: 17px base
- Padding: 12px-16px
- Gap: 8px-12px
- Touch targets: 44x44px minimum
- Bottom nav: 80px height

### Tablet (768px+)
- Font size: 16px base
- Padding: 16px-20px
- Gap: 12px-16px
- Sidebar: 260px width
- Content max-width: 100%

### Desktop (1024px+)
- Font size: 16px base
- Padding: 20px-24px
- Gap: 16px-20px
- Sidebar: 260px (collapsible to 72px)
- Content max-width: 1200px
- Floating elements: 16px from edges

---

## 12. Accessibility Checklist

- [ ] Color contrast: 4.5:1 minimum (normal text)
- [ ] Touch targets: 44x44px minimum
- [ ] Focus states: Visible ring on all interactive elements
- [ ] Alt text: All meaningful images
- [ ] ARIA labels: Icon-only buttons
- [ ] Keyboard navigation: Tab order matches visual order
- [ ] Form labels: Associated with inputs
- [ ] Error messages: Clear, near problem
- [ ] prefers-reduced-motion: Respected
- [ ] Semantic HTML: Proper heading hierarchy

---

## 13. Performance Checklist

- [ ] GPU acceleration: transform, opacity only
- [ ] Backdrop filter: Used sparingly (blur cost)
- [ ] Content visibility: auto on staggered children
- [ ] Backface visibility: hidden on animated elements
- [ ] Will-change: Used only on animated elements
- [ ] Image optimization: WebP, srcset, lazy loading
- [ ] Animation duration: 150-600ms (not instant, not slow)
- [ ] Reduced motion: Animations disabled if prefers-reduced-motion

---

## 14. Implementation Examples

### Button Component
```tsx
// Sizes: sm (36px), md (44px), lg (48px), xl (56px)
// Variants: primary, secondary, danger, success
// States: default, hover, active, disabled, loading

<Button size="md" variant="primary">
  Action
</Button>
```

### Input Component
```tsx
// Sizes: sm (36px), md (44px), lg (48px)
// States: default, focus, error, disabled
// With label, placeholder, error message

<Input
  label="Label"
  placeholder="Placeholder"
  error="Error message"
  size="md"
/>
```

### Card Component
```tsx
// Glass effect: blur-md, opacity-20, border-15
// Padding: lg (16px) or xl (20px)
// Interactive: hover scale(1.02)

<Card className="glass-card">
  Content
</Card>
```

---

## 15. Migration Checklist

- [ ] Update all Button sizes to standard scale
- [ ] Update all Input sizes to standard scale
- [ ] Standardize all padding/margin to spacing scale
- [ ] Update all glass effects to unified system
- [ ] Fix all touch targets to ≥ 44x44px
- [ ] Update responsive breakpoints
- [ ] Test on: 375px, 768px, 1024px, 1440px
- [ ] Verify contrast ratios
- [ ] Test keyboard navigation
- [ ] Test with prefers-reduced-motion
