# Product

## Register

product

## Users

Visitors, students, demonstrators, and curious users who want to experience a Taiwanese temple oracle flow through a browser. They are likely using a laptop or tablet camera in a classroom, exhibition, demo booth, or personal exploratory setting. Their job is to ask a question, complete the ritual steps, and receive an AI-assisted interpretation without needing to understand the backend or the mechanics of traditional divination.

## Product Purpose

AI 求籤互動系統 recreates the fortune-drawing ritual as an immersive web interaction: ask a question, pray with incense, shake and draw a fortune stick, cast moon blocks, then receive an AI interpretation. The frontend owns the experience, motion feedback, state progression, and API orchestration; the backend owns fortune selection, block results, confirmation state, and AI content. Success means the user always understands the current ritual stage, feels their gestures are seen, and can finish the flow even when motion detection fails.

## Brand Personality

Ceremonial, calm, responsive. The interface should feel like modern interactive installation design informed by Taiwanese temple rituals: respectful, warm, tactile, and slightly magical, without becoming horror-themed, gimmicky, or visually noisy.

## Anti-references

Do not make it look like a generic SaaS form wizard, a beige wellness app, a horror occult interface, a neon cyberpunk demo, or a static brochure page. Avoid small webcam preview boxes as the main interaction surface; the camera should feel like the environment behind the ritual. Avoid decorative animation that does not clarify gesture progress, stage changes, or ritual consequence.

## Design Principles

- Make the ritual state legible: every stage should clearly show what the system is waiting for and what changed after success.
- Treat the camera as the scene, not an attachment: motion interaction belongs in the full viewport with overlays, targets, and feedback.
- Animate consequence, not ornament: flashes, darkening, particles, rings, and object motion should confirm a completed gesture or scene transition.
- Preserve cultural texture without blocking usability: temple-inspired visuals should support scanning, action, fallback, and accessibility.
- Keep deterministic results backend-owned: frontend motion can dramatize the ritual but must not invent fortune, block, or interpretation outcomes.

## Accessibility & Inclusion

Target practical WCAG AA contrast for text and controls. Support reduced-motion preferences with simplified fades instead of large movement. Always provide click/touch fallback for camera or gesture failures. Do not require users to upload, save, or expose camera video; camera frames are browser-local for MediaPipe detection only.
