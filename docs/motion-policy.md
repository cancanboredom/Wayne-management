# Motion Policy (GSAP-First)

This project is GSAP-first for all custom motion.

## Hard Rules

- Use GSAP helpers/presets for all component animations.
- Do not add `@keyframes` or CSS `animation:` for app UI motion.
- Do not add inline `style={{ animation: ... }}`.
- Prefer shared helpers in `src/lib/motion/*` and `src/components/animations/*`.

## Allowed Exceptions

Only accessibility/system exceptions are allowed:

- `accessibility`
- `system-native`

Every exception must include an inline marker near the code:

```css
/* motion-exception: accessibility */
```

```ts
// motion-exception: system-native
```

## Performance and Capability Tiers

- `off`: reduced-motion or severe constraints
- `minimal`: constrained devices/network
- `balanced`: default
- `full`: high capability devices

Use `useMotionTier()` and policy-driven presets (`presets.ts`) instead of hard-coded durations/eases.

## CI Enforcement

`npm run motion:check` fails when disallowed patterns are found outside temporary migration allowlists.
