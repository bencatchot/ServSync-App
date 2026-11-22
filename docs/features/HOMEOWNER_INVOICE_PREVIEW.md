# Homeowner invoice preview and request property display

Homeowner invoice cards now have separate **Preview PDF** and **Download PDF** actions. Both use the same invoice and exact owned-property context. The existing mobile viewer handles in-app preview; Download retains the existing save and share path.

Contractor service requests use the selected property's sharing choices for its label and address. Where only overview is shared, the request can display city and state without street or postal code. Sharing an address for one property does not share any other property's address.

The reviewed function in `servsync-service-request-property-display.sql` was applied to ServSync Demo. Build 3 homeowner PDF preview passed owner review on a physical iPhone, including closing and reopening the document.

On phones, Estimates / Invoices shows a single horizontal row of section tabs with counts. Swipe the row or use its side arrows to see more sections. Selecting a tab shows its records immediately below. Only the record list scrolls vertically. Keyboard users can move between tabs with Left, Right, Home and End. **Filters** opens the property scope, search, contractor and sort controls. Choose **Done** to return to the list. Desktop retains the section tiles and inline filters. The layout revision is under Preview review and post-Preview Help Studio playback remains pending.
