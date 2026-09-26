# HairsByGiftee payment backend groundwork

This folder is intentionally not deployed by the current GitHub Actions workflow.

When Paystack setup is complete, this backend will handle:
- server-side price and stock validation
- order creation
- Paystack transaction initialization
- Paystack webhook verification
- payment amount/reference verification
- paid order status updates
- stock reduction after verified payment

Payment credentials must be stored server-side and must not be committed to the repository.


## Shipping model

Nigeria shipping is split into seven zones: Lagos, South West, South East, South South, North Central, North East, and North West. The storefront previews the owner's saved zone rate. When Paystack is enabled, the backend must calculate shipping again server-side and must never trust a delivery fee sent by the browser.

Classes use the same future payment backend but do not receive a shipping charge.
