# PEPE KUN — Safe Functionality Fix

This version was built from the latest PEPE KUN UI files already available in the conversation.

## UI protection
The existing visual HTML/CSS was kept as the source of truth. The repair is focused on JavaScript/Supabase behavior; no new product photos or redesign were introduced.

## Supabase
The site continues using the existing Supabase project and the existing tables:
- products
- carts
- orders
- enquiries

**Do not run a new SQL migration just because this ZIP contains the old setup file.** It is included only as a reference.

## Main fixes
- safer Supabase initialization
- products load from Supabase
- category filtering is tolerant of spacing/case differences
- add-to-cart and persistent cart saving
- cart quantity and remove controls
- avoids repeatedly doubling a saved cart on reload
- guest cart is preserved when logging in
- checkout/order creation with delivery details
- contact enquiries saved to Supabase
- Supabase Auth login/signup
- existing admin product/order/enquiry functionality retained

## GitHub Pages
Upload the files to the same repository. In Supabase Auth URL Configuration, make sure the GitHub Pages site URL is allowed.
