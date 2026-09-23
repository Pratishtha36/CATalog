# CATalog Soft UI

The existing React/Vite application uses Lucide icons and custom CSS with Tailwind available. The redesign preserves task, audio, sensor, IndexedDB, and API behaviour.

## Source of truth

- `frontend/src/styles/tokens.css`: colour, typography, depth, radius, spacing, and transition tokens.
- `frontend/src/styles/theme.css`: shared controls and surfaces, followed by shell, page layouts, and responsive/accessibility rules.
- `frontend/src/components/AppLayout.jsx`: shared brand, navigation, sticky header, mobile disclosure, and main landmark.
- `frontend/src/styles.css`: stylesheet entry point; avoid adding page-specific overrides here.

## Visual decisions

Cool-grey `#E0E5EC` is the common material. Yellow `#FFBF00` identifies primary actions; near-black `#202329` gives headings and controls an industrial character. This is a CAT-inspired palette, not a reproduction of an official logo. Raised cards use translucent light and dark shadows. Inputs, selected navigation, metric icon wells, and the live graph use inset shadows. Static content cards do not move on hover, keeping the operator workspace steady.

DM Sans supplies body text and Plus Jakarta Sans supplies headings, using Google Fonts with `display=swap`. System sans-serif fallbacks work without a font download. Internal storage keys and API/service identifiers remain unchanged so existing data remains accessible. Existing bundled audio files are retained.

## Reuse

Use `.button` plus `.primary`, `.secondary`, or `.neutral` for actions; `.badge` for status; `.text-link` for secondary navigation. Shared surface selectors define the material once. Add page classes for layout rather than hard-coded colours or individual shadows. Use token values for new depth and colour decisions.

## Accessibility and responsive behaviour

- Text uses a darker muted token than the reference palette to improve contrast on grey.
- Yellow actions use dark text, never white text. Status labels accompany warning/success colours.
- Controls have a 48px minimum height, secondary links at least 44px, and visible dark-gold focus outlines. Checkbox labels expand the clickable area.
- At widths below 768px the sidebar becomes a labelled, non-modal disclosure. The toggle exposes expanded state; Escape closes it and restores toggle focus. Opening moves focus to navigation; selecting a link closes it. Secondary routes remain available on mobile.
- Reduced-motion preferences disable transitions and animation. Forced-colour mode restores explicit outlines because shadows may disappear.
- Cards use responsive padding; controls stack on mobile; wide evaluation tables scroll within their container.

## Manual visual review

Check My Day, Add activity, SwingSense (both input modes), Safety, pre-dig review, device checks, and all planned-module pages at 375px, 768px, and 1440px widths. Verify menu toggle/Escape, Tab focus order, warnings, long text and Indian-language prompts, dropdowns, and horizontal table scrolling. No connected browser was available for visual inspection during implementation; build and automated regression results are recorded separately.

## Verification

- Production build passed. Built CSS: 22.85 kB (5.73 kB gzip); JavaScript: 429.69 kB (138.42 kB gzip). No new runtime dependency was added.
- All 16 existing frontend regression tests passed (motion inference/windowing, offline storage/sync, CSV, and bundled audio).
- Calculated token contrast on the common surface: primary ink 12.44:1, muted text 5.21:1, error text 5.72:1, success text 5.49:1, focus colour 5.48:1. Dark text on yellow is 9.52:1. These checks do not replace a full rendered accessibility audit.
- Local frontend and API health endpoints both returned HTTP 200.
- Rendered layouts and mobile-menu interactions still need manual browser verification.
