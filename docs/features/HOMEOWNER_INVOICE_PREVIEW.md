# Homeowner invoice preview and request property display

Homeowner invoice cards now have separate **Preview PDF** and **Download PDF** actions. Both use the same invoice and exact owned-property context. The existing mobile viewer handles in-app preview; Download retains the existing save and share path.

Contractor service requests use the selected property's sharing choices for its label and address. Where only overview is shared, the request can display city and state without street or postal code. Sharing an address for one property does not share any other property's address. This patch does not change a user's sharing choices or apply database changes to a shared environment.

The forward SQL artifact is `servsync-service-request-property-display.sql`. Apply only in the approved rollout process. The fixtures in `tests/sql/service-request-property-display-*.sql` are disposable-test inputs only. A signed-in end-to-end iPhone simulator run and post-Preview tutorial review remain required before release.
