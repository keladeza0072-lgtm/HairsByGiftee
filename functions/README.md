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
