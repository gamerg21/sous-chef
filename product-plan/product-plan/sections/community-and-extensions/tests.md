# Test Instructions: Community & Extensions

These test-writing instructions are **framework-agnostic**. Adapt them to your testing setup.

## Overview

Community & Extensions enables optional community recipe discovery, extension marketplace, and integrations management.

---

## User Flow Tests

### Flow 1: Save Community Recipe

**Steps:**
1. User browses community feed
2. User clicks on a recipe
3. User clicks "Save to Library"

**Expected Results:**
- [ ] Recipe copied to private library
- [ ] Success message shown

---

### Flow 2: Install Extension

**Steps:**
1. User browses extensions
2. User clicks on an extension
3. User reviews permissions
4. User clicks "Install"

**Expected Results:**
- [ ] Extension installed
- [ ] Appears in installed extensions list

---

## Empty State Tests

**Setup:** No community recipes or extensions

**Expected Results:**
- [ ] Shows appropriate empty state messages
- [ ] Provides CTAs to explore or publish

