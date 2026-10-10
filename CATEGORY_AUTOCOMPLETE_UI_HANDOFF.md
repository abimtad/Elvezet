# Cursor: category autocomplete UI

Read the project AGENTS.md and preserve all current working changes. UI work only; the backend API below is implemented locally, not deployed. Do not build APKs or deploy without authorization.

## Requested interaction

Replace editable category text fields with a reusable searchable combobox: current saved value prefilled in edit forms; small simple trailing dropdown chevron; clicking it opens suggestions even with empty search; typing filters suggestions like a country selector. Show relevant shop-specific options. Do not silently select a category for new items. Preserve entered text, custom saved values, current layout, and approved teal staff UI/calendar. Handle keyboard navigation, focus, accessibility, loading, empty/error states. Debounce 200–300ms; cancel/ignore stale responses when text or workspace changes. Fetch again when opening after a save. Do not insert suggestions into the database simply by opening the menu.

## Backend contract

Authenticated GET /api/v1/category-options?kind=service&businessId=<current workspace id>&q=hair&limit=30

Use existing API client, configured endpoint, and Firebase bearer token. Never add a development identity bypass.

Kinds: service, product, specialty require businessId. business and discover forbid businessId. q defaults to empty; maximum 100 characters. limit 1–100, default 30. Response:

```json
{"data":{"kind":"service","businessId":"...","query":"hair","allowCustom":true,"options":[{"value":"Haircuts","label":"Haircuts","source":"catalog"}],"hasMore":false}}
```

Options combine this shop's active existing labels (`source: shop`) with relevant business-type starter suggestions (`source: catalog`), normalize whitespace, deduplicate case-insensitively, and rank exact/prefix before substring matches. They are suggestions, not compulsory defaults. No other shop's labels are included. Specialty combines service labels and this shop's active staff specialties. Unknown business types get General plus existing shop labels. Empty new shops can therefore still show General; do not invent business types or override admin assignments.

Business options come from the active admin catalog. Discover options use the existing content catalog, excluding All. allowCustom=false for these two kinds: keep IDs for business saves (see below), and existing admin-managed creation flows. Services/products/specialties allow custom text, saved via existing endpoints. The suggestion endpoint never creates or renames categories. It returns strings, not category IDs. For business category saves, resolve the selected name to its ID using existing GET /categories or the existing admin catalog response, then retain current businessCategoryId submission. Preserve existing validation and payloads.

Shop-scoped access: owner, active staff member, admin, moderator. Customer discovery/service filters must keep using their existing public business/service/video lists; do not call this protected workspace endpoint from customer browsing. Retain filter semantics (including All/Featured) instead of turning navigation tabs into editable fields. Customer help categories and Muslim-friendly toggles are unrelated and should stay as they are.

## Authoritative UI sources

- BA_SAPP/zolmi_biz/lib/features/owner/owner_business.dart: service categoryName and product category forms.
- BA_SAPP/zolmi_independent/lib/main.dart: service categoryName form. Included as a local dependency by combined Business; do not edit .deployment copies.
- staff_ui_preview/lib/workspace.dart: staff specialties editor; use multi-value chips/autocomplete preserving array payload, not a single category string.
- barber_project_aman/frontend/src/app/services/page.tsx: service add/edit categoryName.
- barber_project_aman/frontend/src/app/inventory/page.tsx: product add/edit category.
- barber_project_aman/frontend/src/app/admin/(protected)/onboard/page.tsx and tenants/page.tsx: business category selectors; preserve ID mapping.
- barber_project_aman/frontend/src/app/admin/(protected)/discover/page.tsx: content category selector; preserve admin category-management controls.

Audit actual routes and all category inputs before editing; generic form widgets may need an injectable category-field renderer rather than changing every text input. Keep existing filter chips/customer tabs unless the user separately requests a visual change. Test shop switching, existing custom categories, missing/expired auth, 403 responses, slow/stale requests, empty results, new custom service/product labels, ID mapping, and keyboard selection. Show loading/error clearly; never fall back to another shop's data.

## Backend verification

New source: src/services/category-options.service.ts, src/routes/category-options.routes.ts; route mounted in src/routes/index.ts. Test: src/tests/category-options.integration.ts. Run npm run typecheck. Pure checks: node -r ts-node/register/transpile-only src/tests/category-options.integration.ts --unit-only. Full integration requires ISOLATED_MONGO_MODULE pointing to mongodb-memory-server and permission to launch its isolated mongod process; never substitute live MONGO_URI. No existing save behavior/data was migrated.
