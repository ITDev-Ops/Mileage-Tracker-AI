# Multi Mile Tracker - PRD

## Overview
AI-powered mileage, tax & expense intelligence platform for iOS, Android, and Web. Beats MileIQ with GPT-4o AI classification, receipt OCR, and IRS-compliant tax reporting.

**Last Updated**: March 2026  
**Version**: 1.0.0 MVP

---

## Architecture

### Tech Stack
- **Frontend**: React Native Expo SDK 54 (expo-router, dark mode)
- **Backend**: FastAPI + MongoDB (Motor async)
- **AI**: OpenAI GPT-4o via emergentintegrations (Emergent Universal Key)
- **Auth**: JWT (email/password) + Emergent Google OAuth
- **Payments**: Stripe via emergentintegrations
- **GPS**: expo-location (foreground tracking, Haversine distance)
- **Camera**: expo-image-picker (receipt OCR)

### File Structure
```
/app/frontend/app/
├── _layout.tsx           # Root layout (AuthProvider)
├── index.tsx             # Auth redirect
├── auth-callback.tsx     # Google OAuth callback handler
├── (auth)/               
│   ├── login.tsx         # Email + Google login
│   └── register.tsx      # Registration
├── (tabs)/               
│   ├── dashboard.tsx     # Main dashboard (GPS, stats, AI insights)
│   ├── trips.tsx         # Trip list with AI classify
│   ├── expenses.tsx      # Expenses + receipt scanner
│   ├── reports.tsx       # Tax reports + CSV export
│   └── settings.tsx      # Profile, subscription
├── trip/[id].tsx         # Trip detail + edit
├── ai/assistant.tsx      # GPT-4o chat interface
└── subscription/index.tsx  # Stripe pricing plans

/app/backend/server.py    # FastAPI with all routes
/app/frontend/constants/theme.ts   # Dark mode design system
/app/frontend/context/AuthContext.tsx
/app/frontend/services/api.ts
/app/frontend/components/TripCard.tsx, LoadingSpinner.tsx
```

---

## Database Schema (MongoDB)

| Collection | Key Fields |
|---|---|
| users | user_id, email, name, subscription_tier, occupation_type, tax_country |
| trips | trip_id, user_id, start/end time, distance, classification, deduction_value, ai_confidence |
| expenses | expense_id, user_id, merchant, amount, category, receipt_base64 |
| ai_logs | log_id, trip_id, prediction, confidence |
| payment_transactions | session_id, user_id, plan, payment_status |

---

## Core Requirements (Static)

### IRS Compliance
- 2026 Business rate: $0.70/mile
- 2026 Medical rate: $0.22/mile  
- 2026 Charity rate: $0.14/mile
- Compliant with IRS Form 2106

### Subscription Tiers
| Tier | Price | Features |
|---|---|---|
| Free | $0 | 40 trips/month, manual entry, basic reports |
| Pro | $9.99/mo | Unlimited trips, AI classification, receipt OCR, PDF reports |
| Business | $19.99/mo | Fleet tracking, team management, API access |

---

## What's Been Implemented (v1.0.0 - March 2026)

### Phase 1 ✅ - Core GPS + Auth
- [x] Email/password authentication (JWT)
- [x] Google OAuth (Emergent-managed)
- [x] GPS trip start/stop with expo-location
- [x] Haversine distance calculation
- [x] Reverse geocoding for addresses
- [x] Trip CRUD (create, read, update, delete)
- [x] Quick classification (Business/Personal/Medical/Charity)
- [x] Monthly/yearly dashboard stats
- [x] 6-month bar chart (mileage visualization)
- [x] Dark mode premium UI

### Phase 2 ✅ - AI + Reports
- [x] GPT-4o AI trip classification (with context from history)
- [x] AI confidence scores + prediction logging
- [x] Receipt OCR scanning (GPT-4o vision)
- [x] Expense management with categories
- [x] CSV export (IRS-compliant)
- [x] Monthly/yearly report summary
- [x] AI chat assistant (multi-turn, session-based)
- [x] AI insights dashboard (personalized monthly analysis)
- [x] Unclassified trip alerts

### Phase 3 ✅ - Payments + Settings
- [x] Stripe subscription checkout (Free/Pro/Business)
- [x] Payment status polling after checkout
- [x] Stripe webhook handling
- [x] Profile settings (name, occupation, tax country)
- [x] Subscription management screen
- [x] Sample data seeding endpoint

---

## Prioritized Backlog

### P0 - Critical for Production
- [x] PDF report generation (reportlab integration) ✅ IMPLEMENTED
- [x] Bulk AI Classify — "Classify all unclassified trips" batch endpoint ✅ IMPLEMENTED
- [x] Interactive map route display (Leaflet WebView) ✅ IMPLEMENTED
- [x] Push notification service (expo-notifications) ✅ IMPLEMENTED
- [x] Background GPS service module (expo-task-manager) ✅ IMPLEMENTED
- [ ] Background GPS tracking active (requires native build)
- [ ] Offline trip caching + sync

### P1 - High Priority
- [ ] AI drive risk analysis (speed trends, safety score)
- [ ] Voice command interface ("Log this as business")
- [ ] Fleet/team management (Business tier)
- [ ] Trip merge/split functionality
- [ ] CPA-ready PDF tax report with Form 2106 summary

### P2 - Nice to Have
- [ ] Rideshare driver mode (Uber/Lyft import)
- [ ] EV mileage optimization (per-kWh tracking)
- [ ] Accountant dashboard (read-only export portal)
- [ ] Multi-vehicle support
- [ ] AI tax optimizer (quarterly predictions, alerts)
- [ ] Geofencing for auto-start detection
- [ ] Apple Watch / Android Wear companion

---

## Next Tasks

1. **Background GPS**: Implement expo-task-manager for auto trip detection when app is backgrounded
2. **PDF Reports**: Use reportlab to generate professional PDF tax reports for Pro tier
3. **Push Notifications**: Expo notifications for daily unclassified trip reminders
4. **Map View**: Add react-native-maps to trip detail screen (requires native build)
5. **Bulk AI Classify**: "Classify all unclassified" batch endpoint
6. **Voice Commands**: expo-speech for "Log this as business trip" voice input
